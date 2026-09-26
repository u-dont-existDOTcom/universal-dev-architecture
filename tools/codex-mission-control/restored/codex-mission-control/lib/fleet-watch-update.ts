// Validation for the owner-facing fleet-watch capability (app/api/fleet-supervisor/[projectId]).
// Mirrors the daemon store bounds; only the two existing watch fields are accepted.
export const FLEET_PROJECT_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,179}$/;
const STATES = new Set(["ACTIVE", "PAUSED", "TERMINAL", "DISABLED"]);
const MIN_CADENCE_MS = 60_000;
const MAX_CADENCE_MS = 604_800_000;
const MAX_BODY_CHARS = 512;

export type FleetWatchUpdate = { state?: "ACTIVE" | "PAUSED" | "TERMINAL" | "DISABLED"; cadenceMs?: number };

export function parseFleetWatchUpdate(raw: string): FleetWatchUpdate | string {
  if (raw.length === 0 || raw.length > MAX_BODY_CHARS) return "Fleet watch update requires a small JSON body.";
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return "Fleet watch update must be JSON.";
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Fleet watch update must be a JSON object.";
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => key !== "state" && key !== "cadenceMs")) {
    return "Fleet watch update accepts only state and cadenceMs.";
  }
  const { state, cadenceMs } = value as Record<string, unknown>;
  const update: FleetWatchUpdate = {};
  if (state !== undefined) {
    if (typeof state !== "string" || !STATES.has(state)) return "Fleet watch state must be ACTIVE, PAUSED, TERMINAL or DISABLED.";
    update.state = state as FleetWatchUpdate["state"];
  }
  if (cadenceMs !== undefined) {
    if (!Number.isInteger(cadenceMs) || (cadenceMs as number) < MIN_CADENCE_MS || (cadenceMs as number) > MAX_CADENCE_MS) {
      return `Fleet watch cadenceMs must be an integer from ${MIN_CADENCE_MS} to ${MAX_CADENCE_MS}.`;
    }
    update.cadenceMs = cadenceMs as number;
  }
  return update;
}
