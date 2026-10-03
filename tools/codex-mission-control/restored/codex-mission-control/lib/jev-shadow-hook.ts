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
      return observation.status === "DISABLED" ? observation
        : { ...observation, latency_ms: observation.latency_ms ?? Math.max(0, now() - started) };
    } finally {
      clearTimeout(timer);
    }
  };
}
