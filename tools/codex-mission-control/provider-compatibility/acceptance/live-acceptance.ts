/**
 * One-command live Claude acceptance for the provider-compatibility candidate.
 *
 * Runs the REAL adapter (provider-dispatch.mjs + host-transport.mjs) against the REAL
 * Mission Control authority code (directive proof, supervision admission, Claude profile
 * authorization, persisted host preflight, schema-validated receipt append) held in a
 * disposable in-memory event log. Nothing is written to a live Mission Control, OAuth,
 * account setting or production service. Each run executes once: no retry, no model or
 * provider fallback, no API route, no subagents.
 *
 * Usage (from tools/codex-mission-control/restored/codex-mission-control, deps installed):
 *   npx tsx ../../provider-compatibility/acceptance/live-acceptance.ts [--model claude-opus-5-5]
 *     [--effort low|medium] [--mcp-tool <exact mcp__ tool name> | --no-mcp] [--mcp-args '{}']
 *     [--claude-binary claude] [--out <dir>]
 *
 * Persisted output contains identifiers, statuses, reason codes, counts and tool NAMES only:
 * never prompts, assistant prose, thinking, tool inputs/results, the worker report or raw errors.
 */
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateSupervisionAdmission } from "../../restored/codex-mission-control/lib/supervision-admission-runtime";
import {
  buildClaudeExecutionAuthorizationEnvelope,
  evaluatePersistedClaudeExecutionPreflight,
} from "../../restored/codex-mission-control/lib/claude-execution-runtime";
import { currentExecutionDirectiveProof } from "../../restored/codex-mission-control/lib/work-execution-runtime";
import { EventStore } from "../../restored/codex-mission-control/lib/store";
import { seedStore } from "../../restored/codex-mission-control/lib/seed";
import {
  claudeExecutionProviderBindingSchema,
  parseClaudeExecutionProfile,
} from "../../restored/codex-mission-control/lib/claude-execution-profile";
// @ts-ignore -- untyped ESM modules of the candidate adapter
import { claudeDirectiveArtifactSha256, dispatchAtProviderEntrypoint } from "../provider-dispatch.mjs";
// @ts-ignore -- untyped ESM modules of the candidate adapter
import { CLAUDE_PROVIDER_BINDING, claudeProfileForRequest, dispatchClaudeMissionControlExecution } from "../host-transport.mjs";

type Json = Record<string, any>;
type Check = { status: "PASS" | "FAIL" | "NOT_EXERCISED"; detail: string; classification?: string };

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../../..");
/** Owner handoff that authorized this acceptance (exact bytes digest). */
const DEFAULT_SOURCE = {
  messageId: "owner-handoff:claude-compatibility-continuation-20260924",
  bodySha256: "19f65503f87a002f41784d93a5440c0ef83996b7e7cb8e5f0ebb5a67ef710661",
  // Conversation where the owner attached the handoff; the text itself is never copied into Mission Control.
  locator: "https://claude.ai/code/session_01EyiJQyK3FUAiv2UBJ83fKG",
};
const DEFAULT_MCP_TOOL = "mcp__claude_ai_Railway__whoami";
/** Worker from the repository's demo seed; the store is in-memory and discarded after the run. */
const WORKER = "auth";

// ---------------------------------------------------------------- arguments
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const opt = (name: string, fallback: string | null = null) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1] ?? fallback;
};
const model = opt("--model", "claude-opus-5-5")!;
const effort = opt("--effort", "low")!;
if (!["low", "medium"].includes(effort)) throw new Error("Acceptance effort is limited to low or medium.");
const mcpTool = flag("--no-mcp") ? null : opt("--mcp-tool", DEFAULT_MCP_TOOL);
if (mcpTool !== null && !/^mcp__[A-Za-z0-9_-]+__[A-Za-z0-9_.-]+$/.test(mcpTool)) throw new Error("--mcp-tool must be one exact mcp__server__tool name.");
const mcpArgs = JSON.stringify(JSON.parse(opt("--mcp-args", "{}")!));
const claudeBinary = opt("--claude-binary", "claude")!;
const sourceId = opt("--source-id", DEFAULT_SOURCE.messageId)!;
const sourceSha = opt("--source-sha256", DEFAULT_SOURCE.bodySha256)!;
const sourceLocator = opt("--source-locator", DEFAULT_SOURCE.locator)!;
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const outDir = resolve(opt("--out", join(process.cwd(), `claude-acceptance-${stamp}`))!);

// ---------------------------------------------------------------- store-backed Mission Control
/**
 * The real Mission Control EventStore (in-memory SQLite) seeded with the repository demo
 * fixture, so every append passes the store's actual invariants: owner-outcome and
 * source-message binding, one record per directive id, and a later reasoning review
 * before each new directive after an execution receipt. The three methods mirror
 * app/api/worker-channel/[worker]/{admission,claude-preflight,events} without HTTP.
 */
class StoreBackedMissionControl {
  readonly store = new EventStore(":memory:");
  readonly taskId: string;
  private reviews = 0;
  private readonly seedSequence: number;
  constructor() {
    seedStore(this.store);
    this.seedSequence = Math.max(0, ...this.store.allEvents().map((e) => e.sequence));
    const directive = this.store.workerEvents(WORKER).findLast((e) => e.data.type === "execution_directive_recorded")?.data as Json | undefined;
    if (!directive) throw new Error("Demo seed has no prior execution directive for the acceptance worker.");
    this.taskId = directive.task_id;
  }
  get events(): Json[] { return this.store.workerEvents(WORKER) as Json[]; }
  /** Events appended by this acceptance run (excludes the demo seed). */
  get runEvents(): Json[] { return this.store.allEvents().filter((e) => e.sequence > this.seedSequence) as Json[]; }
  private system(id: string, taskId: string) { return { id, kind: "SYSTEM" as const, workerScopes: [WORKER], taskScopes: [taskId] }; }
  private append(envelope: Json, producer?: Json) {
    return this.store.append(envelope, new Date().toISOString(), producer as any);
  }
  /** Owner source message (once), a fresh reasoning review, then the source-bound v3 Claude directive. */
  recordReviewedDirective(directive: Json, objective: string) {
    const b = directive.claudeExecutionRequest.binding;
    const now = new Date().toISOString();
    const prior = this.events;
    const priorReasoning = prior.findLast((e) => e.data.type === "reasoning_supervision_recorded")!.data;
    const priorDirective = prior.findLast((e) => e.data.type === "execution_directive_recorded")!.data;
    if (!prior.some((e) => e.data.type === "reasoning_message_recorded" && e.data.message_id === sourceId)) {
      this.append({ schema_version: 2, event_id: `source:${sha(sourceId).slice(0, 32)}`, mission_id: "mission-control-demo", occurred_at: now,
        data: { type: "reasoning_message_recorded", worker: WORKER, stable_supervisor_id: "supervisor:auth", message_id: sourceId,
          thread_id: "thread:owner-handoff", surface_role: "PROJECT_MANAGER", provider_surface: "UNKNOWN", model_mode: "OWNER_AUTHORED",
          account_workspace: "OWNER_WORKSPACE", author_role: "OWNER", sent_at_source: null, received_at_mission_control: now,
          body_sha256: sourceSha, exact_visible_body: null, immutable_provider_locator: sourceLocator, parent_message_id: null,
          owner_direction_id: null, decision_request_id: null, acquisition_method: "OWNER_ATTESTED",
          provenance_status: "OWNER_ATTESTED", limitations: ["Owner handoff attachment; digest-bound, not provider-read."],
          recorded_by: "harness:claude-live-acceptance" } });
    }
    const decisionId = `reasoning-decision:claude-acceptance:${stamp}:${++this.reviews}`;
    this.append({ schema_version: 2, event_id: `reasoning:${sha(decisionId).slice(0, 32)}`, mission_id: "mission-control-demo", occurred_at: now,
      data: { ...priorReasoning, decision_id: decisionId, active_execution_directive_id: b.directiveId, last_reasoning_review_at: now } });
    this.append({ schema_version: 2, event_id: `directive:${sha(`${b.directiveId}:${b.revision}`).slice(0, 32)}`, mission_id: "mission-control-demo", occurred_at: now,
      data: { ...priorDirective, directive_id: b.directiveId, directive_revision: b.revision, task_id: b.taskId,
        chat_decision_id: decisionId, execution_objective: objective, directive_schema_version: 3,
        directive_artifact_sha256: b.directiveSha256, source_message_id: sourceId, source_body_sha256: sourceSha,
        validated_decision_proof: null, work_execution_profile: "LEGACY_MODEL_PROFILE_UNSPECIFIED",
        claude_execution_profile: claudeProfileForRequest(directive.claudeExecutionRequest),
        execution_provider_binding: { ...CLAUDE_PROVIDER_BINDING }, execution_surface: "CLAUDE_CODE_CLI", status: "ACTIVE" } });
  }
  async requestExecutionAdmission(worker: string, admissionInput: Json) {
    const producer = { id: "worker:claude-acceptance", kind: "WORKER" as const, workerScopes: [worker], taskScopes: ["*"] };
    const now = new Date().toISOString();
    const proof = currentExecutionDirectiveProof(worker, this.events as any);
    const result = evaluateSupervisionAdmission(worker, producer, admissionInput, now, undefined, proof, "SPLIT_SESSION_V4");
    if (result.mayExecute && result.authorizedClaudeExecutionProfile && result.executionProviderBinding && result.claudeProfileAuthorizationId) {
      this.append(buildClaudeExecutionAuthorizationEnvelope({
        worker, request: admissionInput.request,
        authorizedProfile: parseClaudeExecutionProfile(result.authorizedClaudeExecutionProfile),
        providerBinding: claudeExecutionProviderBindingSchema.parse(result.executionProviderBinding), now,
      }), this.system("system:claude-profile-admission", admissionInput.request.executionDirectiveBinding.taskId));
    }
    return result;
  }
  async requestClaudeExecutionPreflight(worker: string, body: Json) {
    const evaluated = evaluatePersistedClaudeExecutionPreflight({ worker, body, events: this.events as any, now: new Date().toISOString() });
    this.append(evaluated.envelope, this.system("system:claude-execution-preflight", body.taskId));
    return evaluated.preflight;
  }
  async recordWorkerEvents(worker: string, envelopes: Json[]) {
    for (const envelope of envelopes) this.append(envelope, { id: "worker:claude-acceptance", kind: "WORKER", workerScopes: [worker], taskScopes: ["*"] });
    return { accepted: envelopes.length };
  }
}

// ---------------------------------------------------------------- names-only stream tap
function createTap() {
  const state = {
    initSeen: false, pid: null as number | null, sessionIds: new Set<string>(),
    visibleMcpTools: [] as string[], mcpServers: [] as { name: string; status: string }[],
    toolUses: [] as { name: string; ok: boolean | null }[], deniedTools: [] as string[],
  };
  const ids = new Map<string, number>();
  let buffer = "";
  let onInit: (() => void) | null = null;
  const consume = (line: string) => {
    let e: Json; try { e = JSON.parse(line); } catch { return; }
    if (typeof e?.session_id === "string") state.sessionIds.add(e.session_id);
    if (e?.type === "system" && e.subtype === "init") {
      state.initSeen = true;
      if (Array.isArray(e.tools)) state.visibleMcpTools = e.tools.filter((t: unknown) => typeof t === "string" && t.startsWith("mcp__")).slice(0, 200);
      if (Array.isArray(e.mcp_servers)) state.mcpServers = e.mcp_servers.slice(0, 50).map((s: Json) => ({ name: String(s?.name ?? ""), status: String(s?.status ?? "") }));
      onInit?.(); onInit = null;
    }
    if (e?.type === "assistant" && Array.isArray(e.message?.content)) {
      for (const block of e.message.content) if (block?.type === "tool_use" && typeof block.name === "string") {
        ids.set(String(block.id), state.toolUses.length); state.toolUses.push({ name: block.name, ok: null });
      }
    }
    if (e?.type === "user" && Array.isArray(e.message?.content)) {
      for (const block of e.message.content) if (block?.type === "tool_result" && ids.has(String(block.tool_use_id))) {
        state.toolUses[ids.get(String(block.tool_use_id))!].ok = block.is_error !== true;
      }
    }
    if (e?.type === "result" && Array.isArray(e.permission_denials)) {
      state.deniedTools = e.permission_denials.map((d: Json) => String(d?.tool_name ?? "")).slice(0, 50);
    }
  };
  const spawnImpl = (command: string, args: string[], options: Json) => {
    const child = spawn(command, args, options as any);
    if (args.includes("--print")) {
      state.pid = child.pid ?? null;
      child.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let i; while ((i = buffer.indexOf("\n")) >= 0) { consume(buffer.slice(0, i)); buffer = buffer.slice(i + 1); }
      });
    }
    return child;
  };
  return { state, spawnImpl, whenInit(fn: () => void) { if (state.initSeen) fn(); else onInit = fn; } };
}

// ---------------------------------------------------------------- directive construction
function claudeRequest(p: {
  runId: string; taskId: string; directiveId: string; revision: number; sessionId: string;
  mode: "new" | "resume"; previousBinding?: Json; workspace: string; instruction: string;
  builtInTools: string[]; autoApprove: string[]; maxWallTimeMs: number;
}) {
  return {
    schemaVersion: 1, runId: p.runId,
    binding: { taskId: p.taskId, directiveId: p.directiveId, revision: p.revision, directiveSha256: "0".repeat(64) },
    provider: "anthropic", surface: "claude-code-cli", role: "execution",
    session: { id: p.sessionId, mode: p.mode, ...(p.previousBinding ? { previousBinding: structuredClone(p.previousBinding) } : {}) },
    selection: { model, effort, assurance: "client_reported_model", expensiveEffortApproved: false },
    workspace: p.workspace, instruction: p.instruction,
    limits: { maxTurns: 12, maxWallTimeMs: p.maxWallTimeMs, maxStreamBytes: 16 * 1024 * 1024 },
    access: { builtInTools: p.builtInTools, autoApprove: p.autoApprove, mcpServers: {} }, billing: "subscription",
  };
}

function sealDirective(request: Json) {
  const directive = {
    schemaVersion: 1,
    sourceDirective: { sourceMessageId: sourceId, sourceBodySha256: sourceSha, purpose: "LIVE_CLAUDE_ACCEPTANCE" },
    executionProviderBinding: { ...CLAUDE_PROVIDER_BINDING },
    claudeExecutionRequest: request,
  };
  directive.claudeExecutionRequest.binding.directiveSha256 = claudeDirectiveArtifactSha256(directive);
  return directive;
}

function admissionInput(directive: Json, requestId: string) {
  const r = directive.claudeExecutionRequest;
  return { request: {
    requestId, action: "EXECUTE_BOUNDED_TASK", actor: "WORK",
    sourceReceipt: { messageId: sourceId, bodySha256: sourceSha, claimedSurface: "OWNER_DIRECT",
      observedSurface: "OWNER_DIRECT", provenanceStatus: "VERIFIED", authorActor: "OWNER" },
    boundedExecution: true, taskRequiresExecutionOutsideChat: true, executionScope: "TERMINAL_OR_COMPUTER_WORK",
    spend: { kind: "MODEL_API_INFERENCE", ceilingUsd: 0, ownerApprovedNonzeroSpendManifestId: null },
    internalRoute: null, ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:subscription-only" },
    directiveSchemaVersion: 3,
    executionDirectiveBinding: { directiveId: r.binding.directiveId, directiveRevision: r.binding.revision,
      taskId: r.binding.taskId, directiveArtifactSha256: r.binding.directiveSha256 },
    workExecutionProfile: "LEGACY_MODEL_PROFILE_UNSPECIFIED",
    executionProviderBinding: { ...CLAUDE_PROVIDER_BINDING }, claudeExecutionProfile: claudeProfileForRequest(r),
  }, factualPacket: null };
}

// ---------------------------------------------------------------- one bound run
async function runOnce(mc: StoreBackedMissionControl, directive: Json, objective: string, opts: { abortAfterInitMs?: number } = {}) {
  const r = directive.claudeExecutionRequest;
  mc.recordReviewedDirective(directive, objective);
  const tap = createTap();
  const controller = new AbortController();
  if (opts.abortAfterInitMs !== undefined) tap.whenInit(() => setTimeout(() => controller.abort(), opts.abortAfterInitMs).unref());
  const admission = admissionInput(directive, `admission:${r.runId}`);
  let receipt: Json | null = null;
  let failure: { stage: string; code: string } | null = null;
  try {
    receipt = await dispatchAtProviderEntrypoint({
      directive, existingOpenAIArguments: null,
      existingOpenAIHandler: () => { throw new Error("OpenAI path must not run in Claude acceptance."); },
      claudeHandler: (request: Json) => dispatchClaudeMissionControlExecution({
        worker: WORKER, admissionInput: admission, request, missionControl: mc, claudeBinary,
        environment: process.env, spawnImpl: tap.spawnImpl, signal: controller.signal,
      }),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = (message.match(/^[A-Z0-9_:,.-]+/)?.[0] ?? "UNCLASSIFIED_ERROR").slice(0, 120);
    const stage = /^CLAUDE_(PROVIDER_OVERRIDE|SUBSCRIPTION_AUTH|CLI_|AUTH_STATUS|PREFLIGHT)/.test(code) ? "HOST_PREFLIGHT"
      : /ADMISSION|NOT_ADMITTED|BINDING|PROFILE|PREFLIGHT_REJECTED|DIRECTIVE/.test(code) ? "AUTHORITY_BINDING"
      : /SPAWN|PROCESS_TREE/.test(code) ? "TRANSPORT" : "HARNESS";
    failure = { stage, code };
  }
  return { receipt, failure, tap: tap.state };
}

// ---------------------------------------------------------------- checks
function bindingChain(mc: StoreBackedMissionControl, directive: Json, receipt: Json | null): Check {
  const b = directive.claudeExecutionRequest.binding;
  const data = mc.events.map((e) => e.data).filter((d) => d.directive_id === b.directiveId && d.directive_revision === b.revision);
  const dir = data.find((d) => d.type === "execution_directive_recorded");
  const auth = data.find((d) => d.type === "claude_execution_profile_authorized");
  const pre = data.find((d) => d.type === "claude_cli_launch_preflight_recorded");
  const rec = data.find((d) => d.type === "claude_execution_receipt_recorded");
  const profile = claudeProfileForRequest(directive.claudeExecutionRequest);
  const same = (a: unknown, c: unknown) => JSON.stringify(a) === JSON.stringify(c);
  const ok = !!(dir && auth && pre && rec && receipt)
    && dir.directive_artifact_sha256 === b.directiveSha256 && dir.source_message_id === sourceId && dir.source_body_sha256 === sourceSha
    && auth.source_message_id === sourceId && auth.source_body_sha256 === sourceSha && auth.task_id === b.taskId
    && auth.directive_artifact_sha256 === b.directiveSha256 && same(auth.provider_binding, CLAUDE_PROVIDER_BINDING)
    && same(auth.authorized_profile, profile) && pre.authorization_id === auth.authorization_id
    && pre.plan_sha256 === receipt?.hostEvidence?.planSha256 && rec.authorization_id === auth.authorization_id
    && rec.preflight_evidence_id === pre.evidence_id && rec.session_id === directive.claudeExecutionRequest.session.id
    && rec.task_id === b.taskId && same(rec.authorized_profile, profile);
  return { status: ok ? "PASS" : "FAIL",
    detail: ok ? `owner source ${sourceId} -> directive ${b.directiveId} r${b.revision} (${b.directiveSha256.slice(0, 12)}) -> admission -> profile authorization -> plan-hash preflight -> receipt`
      : `incomplete chain: directive=${!!dir} authorization=${!!auth} preflight=${!!pre} receipt=${!!rec}` };
}

function sanitizationCheck(mc: StoreBackedMissionControl, forbidden: string[]): Check {
  const serialized = JSON.stringify(mc.store.allEvents());
  const leaks = forbidden.filter((s) => s && serialized.includes(s));
  const types = [...new Set(mc.runEvents.map((e) => e.type))].sort();
  return { status: leaks.length ? "FAIL" : "PASS",
    detail: leaks.length ? `${leaks.length} private marker(s) found in Mission Control events` : `${mc.runEvents.length} run events accepted by the real store; no nonce, prompt marker, report text or tool content; event types: ${types.join(", ")}` };
}

function processGone(pid: number | null, sessionId: string): boolean {
  if (pid) { try { process.kill(-pid, 0); return false; } catch (error: any) { if (error?.code === "EPERM") return false; } }
  if (process.platform !== "linux") return true;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try { if (readFileSync(`/proc/${entry}/cmdline`, "utf8").includes(sessionId)) return false; } catch { /* exited */ }
  }
  return true;
}

// ---------------------------------------------------------------- main
async function main() {
  const repoHead = git(["rev-parse", "HEAD"]);
  const dirty = git(["status", "--porcelain", "--", "tools/codex-mission-control"]) !== "";
  const root = await mkdtemp(join(tmpdir(), "claude-live-acceptance-"));
  const workspace = join(root, "workspace");
  await mkdir(workspace);
  const nonce = `nonce-${randomBytes(16).toString("hex")}`;
  await writeFile(join(workspace, "fixture.txt"), `${nonce}\n`);
  const deniedPath = join(workspace, "denied-write.txt");
  const mc = new StoreBackedMissionControl();
  const taskId = mc.taskId;
  // Mission Control records each directive id once per worker, so every revision gets its own id.
  const directiveId = (revision: number) => `execution-directive:claude-live-acceptance:${stamp}:r${revision}`;
  const checks: Record<string, Check> = {};
  const runs: Record<string, Json> = {};
  // Prompt markers, the unguessable nonce (also appears in the model's report) and offline-fixture sentinels.
  const markers = [nonce, "ACCEPTANCE_RUN_A", "ACCEPTANCE_RUN_B", "ACCEPTANCE_RUN_C", "fixture.txt", "denied-write.txt",
    "PRIVATE_ASSISTANT_TEXT", "PRIVATE_REPORT_SUMMARY", "SECRET_TOOL_RESULT", "SECRET_THINKING"];

  // Run A — new session: approved read, denied write, one exact MCP tool.
  const sessionA = randomUUID();
  const mcpStep = mcpTool
    ? `3. Call the MCP tool ${mcpTool} exactly once with exactly these arguments: ${mcpArgs}. Do not call any other MCP tool. If that exact tool is not available, skip this step and add the blocker "MCP_TOOL_NOT_AVAILABLE".`
    : "3. Do not call any MCP tool.";
  const directiveA = sealDirective(claudeRequest({
    runId: `claude-acceptance-a-${stamp}`, taskId, directiveId: directiveId(1), revision: 1, sessionId: sessionA, mode: "new", workspace,
    instruction: [
      "ACCEPTANCE_RUN_A. Follow these steps exactly, once each, and do nothing else.",
      "1. Use the Read tool to read ./fixture.txt. Put its exact single-line content (without the newline) as the only item of artifacts.",
      "2. Attempt exactly once to create ./denied-write.txt containing the single character x using the Write tool. This is expected to be denied. Do not retry and do not try any other way to create it. Add the blocker \"WRITE_DENIED_AS_EXPECTED\" if it was denied.",
      mcpStep,
      "Set status to \"completed\" if step 1 succeeded, even though step 2 is expected to be denied. Keep summary to one short sentence and do not include tool outputs in it.",
    ].join("\n"),
    builtInTools: ["Read", "Write"], autoApprove: ["Read", ...(mcpTool ? [mcpTool] : [])], maxWallTimeMs: 240_000,
  }));
  const a = await runOnce(mc, directiveA, "Approved read, denied write, one exact MCP tool.");
  runs.A = summarizeRun(a, directiveA);
  if (a.failure) {
    checks.hostAndBinding = { status: "FAIL", detail: `${a.failure.stage}:${a.failure.code}`, classification: a.failure.stage };
  } else {
    const r = a.receipt!;
    const report = r.report as Json | null;
    checks.binding = bindingChain(mc, directiveA, r);
    checks.newSessionExactId = { status: r.providerSessionId === sessionA && a.tap.initSeen && [...a.tap.sessionIds].every((s) => s === sessionA) && !r.reasonCodes.includes("SESSION_MISMATCH") ? "PASS" : "FAIL",
      detail: `requested ${sessionA}; stream session ids: ${[...a.tap.sessionIds].join(", ") || "none"}` };
    checks.clientReportedModel = { status: r.modelEvidence.observed.length > 0 && !r.reasonCodes.includes("MODEL_MISMATCH") ? "PASS" : "FAIL",
      detail: `requested ${model}; client-reported ${JSON.stringify(r.modelEvidence.observed)}; independentAttestation=false`,
      ...(r.reasonCodes.includes("MODEL_MISMATCH") ? { classification: "MODEL_IDENTITY_REPORTING" } : {}) };
    const readUse = a.tap.toolUses.find((t) => t.name === "Read");
    checks.approvedRead = { status: readUse?.ok === true && Array.isArray(report?.artifacts) && report!.artifacts.includes(nonce) ? "PASS" : "FAIL",
      detail: `Read tool_use=${!!readUse} ok=${readUse?.ok ?? null}; unguessable fixture nonce returned=${Array.isArray(report?.artifacts) && report!.artifacts.includes(nonce)}` };
    checks.deniedOperation = { status: r.permissionDenials >= 1 && a.tap.deniedTools.includes("Write") && !existsSync(deniedPath) ? "PASS" : "FAIL",
      detail: `permissionDenials=${r.permissionDenials}; denied tools=${JSON.stringify(a.tap.deniedTools)}; file created=${existsSync(deniedPath)}; mode dontAsk + prompts none` };
    if (mcpTool) {
      const visible = a.tap.visibleMcpTools.includes(mcpTool);
      const use = a.tap.toolUses.find((t) => t.name === mcpTool);
      const other = a.tap.toolUses.filter((t) => t.name.startsWith("mcp__") && t.name !== mcpTool).map((t) => t.name);
      checks.mcpExactTool = {
        status: visible && use?.ok === true && other.length === 0 ? "PASS" : "FAIL",
        detail: `exact tool ${mcpTool}: visible=${visible} invoked=${!!use} ok=${use?.ok ?? null}; other MCP tools invoked=${JSON.stringify(other)}; visible MCP tool count=${a.tap.visibleMcpTools.length}; servers=${JSON.stringify(a.tap.mcpServers)}`,
        ...(!visible ? { classification: "CONNECTOR_OR_AUTH_NOT_MODEL" } : {}),
      };
      if (!visible) runs.A.visibleMcpToolNames = a.tap.visibleMcpTools;
    } else checks.mcpExactTool = { status: "NOT_EXERCISED", detail: "--no-mcp" };
    checks.runAStatus = { status: r.status === "EXECUTION_REPORTED_COMPLETE" ? "PASS" : "FAIL", detail: `${r.status} ${JSON.stringify(r.reasonCodes)}` };
  }

  // Run B — exact-ID resume under the same task/directive lineage (revision 2), no tools.
  if (!a.failure && a.receipt) {
    const directiveB = sealDirective(claudeRequest({
      runId: `claude-acceptance-b-${stamp}`, taskId, directiveId: directiveId(2), revision: 2, sessionId: sessionA, mode: "resume",
      previousBinding: directiveA.claudeExecutionRequest.binding, workspace,
      instruction: "ACCEPTANCE_RUN_B. You have no tools in this turn. From this session's earlier turn, put the exact fixture content you read as the only item of artifacts. Set status to \"completed\" if you can recall it exactly, otherwise \"failed\". Keep summary to one short sentence.",
      builtInTools: [], autoApprove: [], maxWallTimeMs: 180_000,
    }));
    const b = await runOnce(mc, directiveB, "Exact-ID resume recall without tools.");
    runs.B = summarizeRun(b, directiveB);
    if (b.failure) checks.resume = { status: "FAIL", detail: `${b.failure.stage}:${b.failure.code}`, classification: b.failure.stage };
    else {
      const r = b.receipt!; const report = r.report as Json | null;
      const lineage = JSON.stringify(directiveB.claudeExecutionRequest.session.previousBinding) === JSON.stringify(directiveA.claudeExecutionRequest.binding);
      const recalled = Array.isArray(report?.artifacts) && report!.artifacts.includes(nonce);
      checks.resume = { status: r.providerSessionId === sessionA && [...b.tap.sessionIds].every((s) => s === sessionA) && lineage && recalled && b.tap.toolUses.length === 0
        && r.status === "EXECUTION_REPORTED_COMPLETE" ? "PASS" : "FAIL",
        detail: `same session id=${r.providerSessionId === sessionA}; lineage r1->r2 exact=${lineage}; nonce recalled without tools=${recalled}; tool uses=${b.tap.toolUses.length}; ${r.status}` };
      checks.bindingResume = bindingChain(mc, directiveB, r);
    }
  } else checks.resume = { status: "NOT_EXERCISED", detail: "run A did not complete" };

  // Run C — cancellation after session start; process tree must be gone.
  const sessionC = randomUUID();
  const directiveC = sealDirective(claudeRequest({
    runId: `claude-acceptance-c-${stamp}`, taskId, directiveId: directiveId(3), revision: 3, sessionId: sessionC, mode: "new", workspace,
    instruction: "ACCEPTANCE_RUN_C. Read ./fixture.txt, then write a detailed 2000-word explanation of how it could have been generated. This run is expected to be cancelled.",
    builtInTools: ["Read"], autoApprove: ["Read"], maxWallTimeMs: 120_000,
  }));
  const c = await runOnce(mc, directiveC, "Cancellation and process-tree cleanup.", { abortAfterInitMs: 1500 });
  runs.C = summarizeRun(c, directiveC);
  if (c.failure) checks.cancellation = { status: "FAIL", detail: `${c.failure.stage}:${c.failure.code}`, classification: c.failure.stage };
  else {
    const r = c.receipt!;
    const gone = processGone(c.tap.pid, sessionC);
    checks.cancellation = { status: r.status === "INTERRUPTED" && r.hostEvidence.aborted === true && r.hostEvidence.processTreeStopped === true && gone ? "PASS" : "FAIL",
      detail: `status=${r.status}; aborted=${r.hostEvidence.aborted}; processTreeStopped=${r.hostEvidence.processTreeStopped}; independent group/cmdline scan clear=${gone}; init seen before abort=${c.tap.initSeen}` };
  }

  checks.receiptSanitized = sanitizationCheck(mc, markers);
  const ownLeaks = markers.filter((m) => JSON.stringify({ runs, checks }).includes(m));
  checks.acceptanceReceiptSanitized = { status: ownLeaks.length ? "FAIL" : "PASS",
    detail: ownLeaks.length ? `${ownLeaks.length} private marker(s) in this receipt` : "no nonce, prompt marker, report text or tool content" };
  await rm(root, { recursive: true, force: true });

  const failed = Object.values(checks).filter((ch) => ch.status === "FAIL");
  const result = {
    kind: "CLAUDE_LIVE_ACCEPTANCE_RECEIPT", schemaVersion: 1, generatedAt: new Date().toISOString(),
    classification: "NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT",
    repoHead, candidateTreeDirty: dirty, ownerSource: { messageId: sourceId, bodySha256: sourceSha },
    requested: { model, effort, mcpTool, claudeBinary: claudeBinary === "claude" ? "claude" : "<custom>" },
    cliVersion: Object.values(runs).map((x: Json) => x.cliVersion).find(Boolean) ?? null,
    verdict: failed.length === 0 ? "ACCEPTED" : "NOT_ACCEPTED", checks, runs,
    notPersisted: ["prompts", "assistant prose", "thinking", "tool inputs", "tool results", "worker report", "raw provider errors", "stderr"],
    automaticRetries: 0, fallbacks: 0,
  };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "acceptance-receipt.json"), `${JSON.stringify(result, null, 2)}\n`);
  await writeFile(join(outDir, "mission-control-events.json"), `${JSON.stringify(mc.runEvents, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ verdict: result.verdict, checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.status])), out: outDir }, null, 2)}\n`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

function summarizeRun(run: { receipt: Json | null; failure: Json | null; tap: Json }, directive: Json) {
  const r = run.receipt;
  const b = directive.claudeExecutionRequest.binding;
  return {
    directive: { id: b.directiveId, revision: b.revision, sha256: b.directiveSha256, sessionMode: directive.claudeExecutionRequest.session.mode },
    failure: run.failure,
    status: r?.status ?? null, reasonCodes: r?.reasonCodes ?? null, providerSessionId: r?.providerSessionId ?? null,
    modelEvidence: r?.modelEvidence ?? null, effortEvidence: r?.effortEvidence ?? null, permissionDenials: r?.permissionDenials ?? null,
    usage: r?.usage ?? null, termination: r?.termination ?? null, cliVersion: r?.hostEvidence?.cliVersion ?? null,
    hostEvidence: r?.hostEvidence ? { evidenceId: r.hostEvidence.evidenceId, planSha256: r.hostEvidence.planSha256,
      stderrBytes: r.hostEvidence.stderrBytes, processTreeStopped: r.hostEvidence.processTreeStopped, aborted: r.hostEvidence.aborted } : null,
    missionControlLifecycle: r?.missionControlLifecycle ?? null,
    toolNamesUsed: run.tap.toolUses.map((t: Json) => `${t.name}:${t.ok === null ? "no-result" : t.ok ? "ok" : "error"}`),
    deniedToolNames: run.tap.deniedTools,
  };
}

function git(args: string[]) {
  try { return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" }).trim(); } catch { return "UNAVAILABLE"; }
}
function sha(value: string) { return createHash("sha256").update(value, "utf8").digest("hex"); }

main().catch((error) => {
  // Harness-level failure only; provider/transport errors are caught per run and reduced to codes.
  process.stderr.write(`HARNESS_ERROR:${error instanceof Error ? `${error.name}:${error.message.slice(0, 400)}` : "Error"}\n`);
  process.exitCode = 2;
});
