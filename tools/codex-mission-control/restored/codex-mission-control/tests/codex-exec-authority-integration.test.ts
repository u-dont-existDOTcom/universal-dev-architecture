import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { parseAppendEnvelope, type StoredEvent } from "../lib/schema";
import { evaluateSupervisionAdmission } from "../lib/supervision-admission-runtime";
import {
  buildWorkExecutionAuthorizationEnvelope,
  evaluatePersistedWorkExecutionPreflight,
} from "../lib/work-execution-runtime";
import {
  WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
  WORK_MODEL_ROUTING_POLICY_REF,
  type WorkExecutionProfile,
} from "../lib/work-execution-profile";

const candidateModuleUrl = new URL("../../../vps-browser-relay/src/codex-exec-candidate.mjs", import.meta.url).href;
let candidate: any;

async function loadCandidate() {
  candidate ??= await import(candidateModuleUrl);
  return candidate;
}

const profile: WorkExecutionProfile = {
  model: "GPT_5_6_SOL", effort: "LOW", routingTier: "SOL_LOW", routingTriggers: [],
  fastModeRequest: "DO_NOT_ENABLE_FAST", assuranceRequirement: "SET_REQUEST_SUFFICIENT",
  policyRef: WORK_MODEL_ROUTING_POLICY_REF,
  routingPolicyBaseCommit: WORK_MODEL_ROUTING_POLICY_BASE_COMMIT,
  contractVersion: "TRUSTED_SETTER_V1",
};
const outputSchema = {
  type: "object", additionalProperties: false, required: ["success", "value"],
  properties: { success: { type: "boolean" }, value: { type: "string" } },
};

test("integrated Smoke A uses actual Mission Control admission/preflight before CODEX_LOCAL", async () => {
  const fixture = await smokeFixture("smoke-a", { type: "LOCAL_FILESYSTEM_COMMAND" });
  const result = await candidate.dispatchMissionControlExecution(fixture.dispatchInput);
  assert.equal(fixture.runtime.actualAdmission?.mayExecute, true);
  assert.equal(fixture.runtime.actualPreflight?.allowed, true);
  assert.equal(result.route, "CODEX_LOCAL");
  assert.equal(result.status, "COMPLETED");
  assert.deepEqual(fixture.runtime.lifecycleTypes, ["codex_execution_started", "execution_receipt_recorded"]);
});

test("integrated Smoke B uses actual Mission Control admission/preflight before restricted MCP", async () => {
  const fixture = await smokeFixture("smoke-b", { type: "BROWSER", name: "EXAMPLE_TARGET_LIFECYCLE" });
  const adapterPath = join(fixture.root, "qualified-adapter.mjs");
  const adapterBytes = "console.log('qualified adapter smoke');\n";
  await writeFile(adapterPath, adapterBytes, { mode: 0o700 });
  fixture.dispatchInput.config.restrictedBrowserAdapterPath = adapterPath;
  fixture.dispatchInput.config.restrictedBrowserAdapterSha256 = sha256(adapterBytes);
  fixture.dispatchInput.config.environment.FAKE_CODEX_EXISTING_MCP = "unrestricted_browser";
  const result = await candidate.dispatchMissionControlExecution(fixture.dispatchInput);
  assert.equal(fixture.runtime.actualAdmission?.mayExecute, true);
  assert.equal(fixture.runtime.actualPreflight?.allowed, true);
  assert.equal(result.route, "CODEX_BROWSER_RESTRICTED");
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.protocol.completedRestrictedBrowserToolCallCount, 1);
  assert.equal(result.protocol.commandExecutionCount, 0);
  assert.equal(result.mcpPreflight.rawCdpEndpointExposed, false);
  assert.deepEqual(fixture.runtime.lifecycleTypes, ["codex_execution_started", "execution_receipt_recorded"]);
});

test("automatic durable-state dispatch uses the actual admission/preflight evaluator before CODEX_LOCAL", async () => {
  const fixture = await smokeFixture("automatic-smoke-a", { type: "LOCAL_FILESYSTEM_COMMAND" });
  const directive = fixture.dispatchInput.directive;
  const payload = {
    schemaVersion: 1,
    jobId: directive.jobId,
    deadline: directive.deadline,
    workspace: directive.workspace,
    executionCapability: directive.executionCapability,
    outputSchema: directive.outputSchema,
    prompt: directive.prompt,
  };
  const sourceBody = `${candidate.CODEX_EXECUTION_PAYLOAD_PREFIX}${JSON.stringify(payload)}`;
  directive.sourceDirective.sourceBodySha256 = sha256(sourceBody);
  const artifactSha256 = candidate.codexDirectiveArtifactSha256(directive);
  fixture.runtime.snapshot = {
    generatedAt: new Date().toISOString(),
    workers: [{ id: fixture.dispatchInput.worker, timeline: [
      { sequence: 1, data: {
        type: "reasoning_message_recorded", message_id: directive.sourceDirective.sourceMessageId,
        surface_role: "PROJECT_MANAGER", author_role: "ASSISTANT", provenance_status: "VERIFIED",
        body_sha256: directive.sourceDirective.sourceBodySha256, exact_visible_body: sourceBody,
        decision_request_id: "legacy-request:automatic-smoke-a",
      } },
      { sequence: 2, data: {
        type: "execution_directive_recorded", worker: fixture.dispatchInput.worker,
        directive_id: directive.sourceDirective.id, directive_revision: directive.sourceDirective.revision,
        task_id: directive.sourceDirective.taskId, directive_schema_version: 3,
        directive_artifact_sha256: artifactSha256,
        source_message_id: directive.sourceDirective.sourceMessageId,
        source_body_sha256: directive.sourceDirective.sourceBodySha256,
        work_execution_profile: profile, status: "ACTIVE",
      } },
    ] }],
  };
  const result = await candidate.dispatchAutomaticMissionControlExecution({
    config: fixture.dispatchInput.config,
    missionControl: fixture.runtime,
    legacyBrowserHandler: async () => { throw new Error("legacy browser path must not run"); },
    spawnImpl: spawn,
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.route, "CODEX_LOCAL");
  assert.equal(fixture.runtime.actualAdmission?.mayExecute, true);
  assert.equal(fixture.runtime.actualPreflight?.allowed, true);
  assert.deepEqual(fixture.runtime.lifecycleTypes, ["codex_execution_started", "execution_receipt_recorded"]);
});

async function smokeFixture(name: string, executionCapability: Record<string, string>) {
  const candidate = await loadCandidate();
  const root = await mkdtemp(join(tmpdir(), `mc-authority-integration-${name}-`));
  const workspace = join(root, "workspace");
  const sourceCodexHome = join(root, "source-codex-home");
  await mkdir(workspace);
  await mkdir(sourceCodexHome);
  await writeFile(join(sourceCodexHome, "auth.json"), "SMOKE_FIXTURE_SUBSCRIPTION_CREDENTIAL\n", { mode: 0o600 });
  const fakeCodex = join(root, "fake-codex.mjs");
  await writeFile(fakeCodex, fakeCodexSource(), { mode: 0o700 });
  const directive = {
    schemaVersion: 2,
    jobId: `job-${name}`,
    sourceDirective: {
      id: `directive:${name}:1`, revision: 1, taskId: `task:${name}`,
      sourceMessageId: `chat-message:${name}:1`, sourceBodySha256: "a".repeat(64),
    },
    requestedModel: "gpt-5.6-sol", reasoningEffort: "low", workExecutionProfile: profile,
    deadline: new Date(Date.now() + 30_000).toISOString(), workspace,
    executionCapability, outputSchema, prompt: `harmless integrated ${name}`,
  };
  const admissionInput = {
    request: {
      requestId: `admission:${name}:1`, action: "EXECUTE_BOUNDED_TASK", actor: "WORK",
      sourceReceipt: {
        messageId: directive.sourceDirective.sourceMessageId,
        bodySha256: directive.sourceDirective.sourceBodySha256,
        claimedSurface: "CHATGPT_PROJECT_MANAGER", observedSurface: "CHATGPT_PROJECT_MANAGER",
        provenanceStatus: "VERIFIED", authorActor: "PROJECT_MANAGER_CHAT",
      },
      boundedExecution: true, taskRequiresExecutionOutsideChat: true,
      executionScope: "TERMINAL_OR_COMPUTER_WORK",
      spend: { kind: "MODEL_API_INFERENCE", ceilingUsd: 0, ownerApprovedNonzeroSpendManifestId: null },
      internalRoute: null,
      ownerPolicy: { paidModelInferenceAllowed: false, activeZeroSpendDecisionId: "owner:zero-spend" },
      directiveSchemaVersion: 3,
      executionDirectiveBinding: {
        directiveId: directive.sourceDirective.id, directiveRevision: 1,
        taskId: directive.sourceDirective.taskId,
        directiveArtifactSha256: candidate.codexDirectiveArtifactSha256(directive),
      },
      workExecutionProfile: profile,
    },
    factualPacket: null,
  };
  const worker = `worker-${name}`;
  const runtime = new AuthoritativeMissionControlRuntime(worker, directive);
  const config: any = {
    previewEnabled: true, stateDir: join(root, "durable-state"), runtimeDir: join(root, "ephemeral-runtime"),
    codexBinary: fakeCodex, sourceCodexHome, nodeBinary: process.execPath,
    restrictedBrowserAdapterPath: null, restrictedBrowserAdapterSha256: null,
    maxTimeoutMs: 60_000, mcpStartupTimeoutSeconds: 5, mcpToolTimeoutSeconds: 5,
    environment: { ...process.env },
  };
  return {
    root,
    runtime,
    dispatchInput: {
      worker, admissionInput, setterEvidenceId: `setter:${name}:1`, directive,
      config,
      missionControl: runtime,
      legacyBrowserHandler: async () => { throw new Error("legacy browser path must not run in integrated Codex smokes"); },
      spawnImpl: spawn,
    },
  };
}

class AuthoritativeMissionControlRuntime {
  events: StoredEvent[] = [];
  sequence = 0;
  lifecycleTypes: string[] = [];
  actualAdmission: any = null;
  actualPreflight: any = null;
  snapshot: any = null;
  producer: AuthenticatedProducer;

  constructor(private worker: string, private directive: any) {
    this.producer = { id: `worker:${worker}`, kind: "WORKER", workerScopes: [worker], taskScopes: [directive.sourceDirective.taskId] };
  }

  async requestExecutionAdmission(worker: string, input: any) {
    assert.equal(worker, this.worker);
    const proof = {
      directiveId: this.directive.sourceDirective.id,
      directiveRevision: this.directive.sourceDirective.revision,
      taskId: this.directive.sourceDirective.taskId,
      directiveArtifactSha256: candidate.codexDirectiveArtifactSha256(this.directive),
      sourceMessageId: this.directive.sourceDirective.sourceMessageId,
      sourceBodySha256: this.directive.sourceDirective.sourceBodySha256,
      status: "ACTIVE" as const,
      workExecutionProfile: profile,
    };
    const now = new Date().toISOString();
    const result = evaluateSupervisionAdmission(worker, this.producer, input, now, undefined, proof);
    this.actualAdmission = result;
    if (result.mayExecute && result.authorizedWorkExecutionProfile && result.authorizedWorkExecutionProfile !== "LEGACY_MODEL_PROFILE_UNSPECIFIED") {
      const authorization = buildWorkExecutionAuthorizationEnvelope({ worker, request: input.request, authorizedProfile: result.authorizedWorkExecutionProfile, now });
      this.events.push(this.stored(authorization, "SYSTEM", "system:work-profile-admission"));
      this.events.push(this.stored({
        schema_version: 2, event_id: `setter:${worker}:1`, mission_id: "mission-control-live", occurred_at: now,
        data: {
          type: "work_task_creation_selection_applied", worker, evidence_id: `setter:${worker.replace(/^worker-/, "")}:1`,
          authorization_id: result.profileAuthorizationId!, directive_id: proof.directiveId,
          directive_revision: proof.directiveRevision, task_id: proof.taskId, authorized_profile: profile,
          model_setter: "gpt-5.6-sol", effort_setter: "low", fast_request: "DO_NOT_ENABLE_FAST",
          fast_setter: null, producer_id: "system:trusted-task-creation", source: "TRUSTED_TASK_CREATION_BOUNDARY",
          provider_task_locator: null, applied_at: now,
        },
      }, "SYSTEM", "system:trusted-task-creation"));
    }
    return { ...result, setterEvidenceId: `setter:${this.worker.replace(/^worker-/, "")}:1` };
  }

  async fetchFleet() { return this.snapshot; }

  async requestWorkExecutionPreflight(worker: string, body: any) {
    const now = new Date().toISOString();
    const evaluated = evaluatePersistedWorkExecutionPreflight({ worker, body, events: this.events, now });
    this.events.push(this.stored(evaluated.envelope, "SYSTEM", "system:work-execution-preflight"));
    this.actualPreflight = evaluated.preflight;
    return { ...evaluated.preflight, preflightId: evaluated.envelope.data.type === "work_execution_preflight_recorded" ? evaluated.envelope.data.preflight_id : null };
  }

  async recordWorkerEvents(worker: string, events: unknown[]) {
    assert.equal(worker, this.worker);
    const parsed = events.map((event) => parseAppendEnvelope(event));
    this.lifecycleTypes.push(...parsed.map((event) => event.data.type));
    return { events: parsed };
  }

  private stored(envelope: any, producerKind: StoredEvent["producerKind"], producerId: string): StoredEvent {
    this.sequence += 1;
    return {
      id: this.sequence, sequence: this.sequence, eventId: envelope.event_id,
      schemaVersion: envelope.schema_version, missionId: envelope.mission_id,
      worker: envelope.data.worker ?? null, type: envelope.data.type,
      occurredAt: envelope.occurred_at, receivedAt: envelope.occurred_at,
      previousHash: this.sequence === 1 ? null : "0".repeat(64), eventHash: "1".repeat(64),
      producerKind, producerId, data: envelope.data,
    };
  }
}

function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }

function fakeCodexSource() {
  return `#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
if (args[0] === 'login' && args[1] === 'status') { process.stderr.write('Logged in using ChatGPT\\n'); process.exit(0); }
if (args[0] === 'mcp' && args[1] === 'list') {
  const disabled = (name) => args.some((value) => value === 'mcp_servers.' + name + '.enabled=false');
  const servers = [];
  if (process.env.FAKE_CODEX_EXISTING_MCP) servers.push({ name: process.env.FAKE_CODEX_EXISTING_MCP, enabled: !disabled(process.env.FAKE_CODEX_EXISTING_MCP) });
  if (args.some((value) => value.startsWith('mcp_servers.existing_chromium_bridge.command='))) servers.push({ name: 'existing_chromium_bridge', enabled: true });
  process.stdout.write(JSON.stringify(servers)); process.exit(0);
}
if (args[0] !== 'exec') process.exit(64);
const resultPath = args[args.indexOf('--output-last-message') + 1];
process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');
if (args.some((value) => value.startsWith('mcp_servers.existing_chromium_bridge.command='))) {
  process.stdout.write(JSON.stringify({ type: 'item.completed', item: {
    id: 'item_mcp_1', type: 'mcp_tool_call', server: 'existing_chromium_bridge', tool: 'example_target_lifecycle',
    arguments: {}, status: 'completed', error: null, result: { structured_content: { success: true } },
  } }) + '\\n');
}
writeFileSync(resultPath, JSON.stringify({ success: true, value: 'ok' }));
process.stdout.write(JSON.stringify({ type: 'turn.completed' }) + '\\n');
`;
}
