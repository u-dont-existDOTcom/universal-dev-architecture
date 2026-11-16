import { canonicalJson, sha256 } from "./canonical";
import type { FleetSupervisorHooks } from "./fleet-supervisor";
import { buildJevShadowState, jevShadowConfiguredModel, jevShadowTimeoutMs, type JevShadowObservation } from "./jev-shadow";

export const JEV_HOOK_DEADLINE_MARGIN_MS = 100;
type Hook = NonNullable<FleetSupervisorHooks["observeJevShadow"]>;
/** A fixed model, or the daemon's version selector (null while no version passes the price guard). */
type ModelSource = string | (() => string | null);

export function boundedJevShadowHook(hook: Hook, options: {
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => number;
  model?: ModelSource;
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
        model: resolveModel(options.model, env) ?? jevShadowConfiguredModel(env),
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
export const DEFAULT_JEV_PROVIDER_FAILURE_COOLDOWN_MS = 86_400_000;
export const DEFAULT_JEV_PROVIDER_FAILURE_THRESHOLD = 3;
/**
 * Failures of the provider call itself: a refused or failed HTTP request, a broken connection, a call that did not
 * settle in time, and a reply Mission Control cannot use (it may still be billed). STATE_BUILD_ERROR and HOOK_ERROR
 * are Mission Control's own faults and never reached the provider, so they don't count.
 */
export const JEV_PROVIDER_FAILURE_CODES: ReadonlySet<string> = new Set([
  "HTTP_ERROR", "TRANSPORT_ERROR", "TIMEOUT", "INVALID_RESPONSE", "HOOK_TIMEOUT",
]);

/** Exploratory shadow-only circuit breaker: never changes deterministic fleet decisions.
 * State sampling and provider backoff are process-local, not durable across daemon restarts.
 */
export function sampleJevShadowOnStateChange(hook: Hook, options: {
  env?: Readonly<Record<string, string | undefined>>;
  now?: () => number;
  resampleMs?: number;
  model?: ModelSource;
  /** Starts the version selector's catalog check when one is due; must not block. */
  refreshModel?: () => void;
  providerFailureCooldownMs?: number;
  providerFailureThreshold?: number;
  log?: (event: Record<string, unknown>) => void;
} = {}): Hook {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((event: Record<string, unknown>) => console.info(JSON.stringify(event)));
  const resampleMs = options.resampleMs ?? DEFAULT_JEV_SAME_STATE_RESAMPLE_MS;
  const providerFailureCooldownMs = options.providerFailureCooldownMs ?? DEFAULT_JEV_PROVIDER_FAILURE_COOLDOWN_MS;
  const providerFailureThreshold = options.providerFailureThreshold ?? DEFAULT_JEV_PROVIDER_FAILURE_THRESHOLD;
  if (!Number.isInteger(resampleMs) || resampleMs < 60_000 || resampleMs > 86_400_000) {
    throw new Error("Jev same-state resample interval must be an integer between 60000 and 86400000 ms.");
  }
  if (!Number.isInteger(providerFailureCooldownMs) || providerFailureCooldownMs < 60_000
    || providerFailureCooldownMs > 604_800_000 || !Number.isInteger(providerFailureThreshold)
    || providerFailureThreshold < 2 || providerFailureThreshold > 10) {
    throw new Error("Jev provider backoff requires a 1-minute-to-7-day cooldown and a 2-to-10 failure threshold.");
  }
  const sampledAt = new Map<string, number>();
  let consecutiveProviderFailures = 0;
  let providerPausedUntil = -Infinity;
  return async (...args) => {
    if (env.MISSION_CONTROL_JEV_SHADOW_ENABLED !== "1") return hook(...args);
    options.refreshModel?.();
    const current = now();
    if (current < providerPausedUntil) return null;
    const model = resolveModel(options.model, env);
    // No version passes the price guard: make no paid call until the catalog offers one again.
    if (model === null) return null;
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
    const previous = sampledAt.get(key);
    if (previous !== undefined && current - previous < resampleMs) return null;
    const observation = await hook(...args);
    if (observation && observation.status !== "DISABLED" && observation.status !== "MISSING_API_KEY") {
      sampledAt.set(key, current);
    }
    if (observation?.status === "OK") {
      if (consecutiveProviderFailures >= providerFailureThreshold) {
        log({ event: "jev_shadow_provider_resumed", after_consecutive_failures: consecutiveProviderFailures,
          model: observation.model });
      }
      consecutiveProviderFailures = 0;
      providerPausedUntil = -Infinity;
    } else if (observation?.status === "ERROR" && JEV_PROVIDER_FAILURE_CODES.has(observation.error_code ?? "")) {
      consecutiveProviderFailures++;
      if (consecutiveProviderFailures >= providerFailureThreshold) {
        providerPausedUntil = current + providerFailureCooldownMs;
        // Codes and the numeric HTTP status only; never a provider body or header.
        log({ event: "jev_shadow_provider_paused", consecutive_failures: consecutiveProviderFailures,
          paused_until: new Date(providerPausedUntil).toISOString(), error_code: observation.error_code,
          ...(observation.http_status === undefined ? {} : { http_status: observation.http_status }),
          model: observation.model });
      }
    }
    return observation;
  };
}

function resolveModel(source: ModelSource | undefined, env: Readonly<Record<string, string | undefined>>): string | null {
  if (typeof source === "function") return source();
  return source ?? jevShadowConfiguredModel(env);
}
