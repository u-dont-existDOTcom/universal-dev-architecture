import { canonicalJson, sha256 } from "./canonical";
import type { FleetSupervisorHooks } from "./fleet-supervisor";
import { buildJevShadowState, DEFAULT_JEV_SHADOW_MODEL, jevShadowTimeoutMs, type JevShadowObservation } from "./jev-shadow";

export const JEV_HOOK_DEADLINE_MARGIN_MS = 100;
type Hook = NonNullable<FleetSupervisorHooks["observeJevShadow"]>;

export function boundedJevShadowHook(hook: Hook, options: {
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => number;
} = {}): Hook {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const deadlineMs = jevShadowTimeoutMs(env.MISSION_CONTROL_JEV_SHADOW_TIMEOUT_MS) + JEV_HOOK_DEADLINE_MARGIN_MS;
  return async (...args) => {
    const started = now();
    const failure = (error_code: "HOOK_ERROR" | "HOOK_TIMEOUT"): JevShadowObservation => {
      let state;
      try { state = buildJevShadowState(args[2], args[3]); } catch {}
      return { status: "ERROR", authoritative: false,
        model: env.MISSION_CONTROL_JEV_SHADOW_MODEL?.trim() || DEFAULT_JEV_SHADOW_MODEL,
        deterministic_trigger: args[1].trigger, state, error_code };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const observation = await Promise.race([
        Promise.resolve().then(() => hook(...args)).catch(() => failure("HOOK_ERROR")),
        new Promise<JevShadowObservation>((resolve) => {
          timer = setTimeout(() => resolve(failure("HOOK_TIMEOUT")), deadlineMs);
        }),
      ]);
      if (observation === null) return null;
      return observation.status === "DISABLED" ? observation
        : { ...observation, latency_ms: observation.latency_ms ?? Math.max(0, now() - started) };
    } finally {
      clearTimeout(timer);
    }
  };
}


export const DEFAULT_JEV_SAME_STATE_RESAMPLE_MS = 3_600_000;

export function sampleJevShadowOnStateChange(hook: Hook, options: {
  now?: () => number;
  resampleMs?: number;
  model?: string;
} = {}): Hook {
  const now = options.now ?? Date.now;
  const resampleMs = options.resampleMs ?? DEFAULT_JEV_SAME_STATE_RESAMPLE_MS;
  if (!Number.isInteger(resampleMs) || resampleMs < 60_000 || resampleMs > 86_400_000) {
    throw new Error("Jev same-state resample interval must be an integer between 60000 and 86400000 ms.");
  }
  const model = options.model ?? DEFAULT_JEV_SHADOW_MODEL;
  const sampledAt = new Map<string, number>();
  return async (...args) => {
    let state;
    try {
      state = buildJevShadowState(args[2], args[3]);
    } catch {
      return hook(...args);
    }
    const key = sha256(canonicalJson({
      project_id: args[0].projectId,
      deterministic_trigger: args[1].trigger,
      model,
      state,
    }));
    const current = now();
    const previous = sampledAt.get(key);
    if (previous !== undefined && current - previous < resampleMs) return null;
    const observation = await hook(...args);
    if (observation && observation.status !== "DISABLED" && observation.status !== "MISSING_API_KEY") {
      sampledAt.set(key, current);
    }
    return observation;
  };
}
