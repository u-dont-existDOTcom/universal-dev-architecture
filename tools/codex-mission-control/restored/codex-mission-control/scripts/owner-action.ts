#!/usr/bin/env tsx
// Mission Control owner-action tool: the owner-approved "capability handle" (2026-09-24).
//
// Run it INSIDE the Mission Control runtime (the container that already holds the owner and internal
// credentials), e.g.:
//   docker exec <mission-control-container> npm run -s owner:action -- watches
//
// It performs a fixed set of named owner actions against the local daemon/app and prints only a
// bounded JSON result. Callers (the owner, Chat, Claude, Work) never see, pass, or copy a credential.
// It is deliberately not a generic authenticated HTTP client: every action has a fixed method, path
// and validated arguments.
import { daemonFetch, daemonMutationHeaders } from "../lib/daemon-client";
import type { AuthenticatedProducer } from "../lib/ingestion-auth";
import { FLEET_ENROLL_PROJECT_ID, parseFleetWatchEnrollment } from "../lib/fleet-watch-enrollment";
import { FLEET_PROJECT_ID, parseFleetWatchUpdate } from "../lib/fleet-watch-update";

const USAGE = `Usage: owner-action <action> [options]
  watches                                             list fleet-supervisor watches
  watch-enroll --project P --worker W --task T [--cadence-ms N]
                                                      enroll an existing worker/task under project P
  watch-set --project P [--state S] [--cadence-ms N]  change an existing watch (S: ACTIVE|PAUSED|TERMINAL|DISABLED)
  reconcile-github                                    run one GitHub decision-receipt reconciliation pass`;

// Deliberately absent: any action that forwards caller-supplied semantic content (such as a source-review
// request body) under the owner credential. Review of PR #254 (2026-09-25): a worker could otherwise
// launder self-authored instructions through the owner route, and a configurable destination could
// receive the owner bearer. Owner-authored supervision requests go through the owner's own session.

const SECRET_ENV = ["MISSION_CONTROL_INTERNAL_TOKEN", "MISSION_CONTROL_OWNER_TOKEN", "MISSION_CONTROL_SESSION_SECRET",
  "MISSION_CONTROL_GITHUB_TOKEN", "GITHUB_TOKEN", "GH_TOKEN", "MISSION_CONTROL_INGEST_CREDENTIALS"];

export class UsageError extends Error {}

function owner(): AuthenticatedProducer {
  return { id: process.env.MISSION_CONTROL_OWNER_ID ?? "owner:primary", kind: "OWNER_AUTHORITY", workerScopes: ["*"], taskScopes: ["*"] };
}

function options(args: string[], allowed: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    const value = args[index + 1];
    if (!flag?.startsWith("--") || !allowed.includes(flag.slice(2)) || value === undefined || value.startsWith("--")) {
      throw new UsageError(`Unexpected argument ${flag ?? ""}.`);
    }
    if (flag.slice(2) in result) throw new UsageError(`Duplicate ${flag}.`);
    result[flag.slice(2)] = value;
  }
  return result;
}

function required(opts: Record<string, string>, name: string): string {
  const value = opts[name];
  if (!value) throw new UsageError(`--${name} is required.`);
  return value;
}

function cadence(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,12}$/.test(value)) throw new UsageError("--cadence-ms must be a whole number.");
  return Number(value);
}

async function jsonResult(response: Response): Promise<{ status: number; body: unknown }> {
  const text = await response.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { error: "Non-JSON response." }; }
  return { status: response.status, body };
}

export async function runOwnerAction(argv: string[]): Promise<{ status: number; body: unknown }> {
  if (!process.env.MISSION_CONTROL_INTERNAL_TOKEN) {
    throw new UsageError("Run this inside the Mission Control runtime; its internal credential is not present here.");
  }
  const [action, ...rest] = argv;
  switch (action) {
    case "watches": {
      options(rest, []);
      return jsonResult(await daemonFetch("/fleet-supervisor", { method: "GET", headers: daemonMutationHeaders(owner()) }));
    }
    case "watch-enroll": {
      const opts = options(rest, ["project", "worker", "task", "cadence-ms"]);
      const project = required(opts, "project");
      if (!FLEET_ENROLL_PROJECT_ID.test(project)) throw new UsageError("--project must look like project:<lowercase-name>.");
      const enrollment = parseFleetWatchEnrollment({ worker: required(opts, "worker"), taskId: required(opts, "task"),
        ...(opts["cadence-ms"] !== undefined ? { cadenceMs: cadence(opts["cadence-ms"]) } : {}) });
      if (typeof enrollment === "string") throw new UsageError(enrollment);
      return jsonResult(await daemonFetch(`/fleet-supervisor/${encodeURIComponent(project)}/enroll`, {
        method: "POST", headers: daemonMutationHeaders(owner(), { "content-type": "application/json" }), body: JSON.stringify(enrollment),
      }));
    }
    case "watch-set": {
      const opts = options(rest, ["project", "state", "cadence-ms"]);
      const project = required(opts, "project");
      if (!FLEET_PROJECT_ID.test(project)) throw new UsageError("--project is not a valid project id.");
      const update = parseFleetWatchUpdate(JSON.stringify({
        ...(opts.state !== undefined ? { state: opts.state } : {}),
        ...(opts["cadence-ms"] !== undefined ? { cadenceMs: cadence(opts["cadence-ms"]) } : {}),
      }));
      if (typeof update === "string") throw new UsageError(update);
      return jsonResult(await daemonFetch(`/fleet-supervisor/${encodeURIComponent(project)}`, {
        method: "POST", headers: daemonMutationHeaders(owner(), { "content-type": "application/json" }), body: JSON.stringify(update),
      }));
    }
    case "reconcile-github": {
      options(rest, []);
      return jsonResult(await daemonFetch("/github/decision-receipts/reconcile", { method: "POST", headers: daemonMutationHeaders(owner()) }));
    }
    default:
      throw new UsageError(action ? `Unknown action ${action}.` : "No action given.");
  }
}

export function redactSecrets(text: string, env: NodeJS.ProcessEnv = process.env): string {
  let result = text;
  for (const name of SECRET_ENV) {
    const value = env[name];
    if (value && value.length >= 8) result = result.split(value).join("[redacted]");
  }
  return result;
}

async function main() {
  try {
    const result = await runOwnerAction(process.argv.slice(2));
    process.stdout.write(redactSecrets(JSON.stringify(result, null, 2)) + "\n");
    process.exitCode = result.status >= 400 ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(redactSecrets(error instanceof UsageError ? `${message}\n${USAGE}\n` : `owner-action failed: ${message}\n`));
    process.exitCode = error instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && /owner-action\.ts$/.test(process.argv[1])) void main();
