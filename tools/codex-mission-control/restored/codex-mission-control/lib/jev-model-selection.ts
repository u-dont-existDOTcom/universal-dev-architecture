/**
 * Automatic Jev version selection for Mission Control's shadow observer.
 *
 * Owner, 2026-11-15: "switch versions yeah that should be automatically checked". The shadow is
 * non-authoritative, so a version change can never alter a deterministic fleet decision, and every
 * observation records the exact model it used. An explicit MISSION_CONTROL_JEV_SHADOW_MODEL pin (any
 * value other than "auto") is the operator's choice and is never replaced.
 *
 * The catalog is OpenRouter's public Decisions model list; the generic model list omits Decisions-only
 * Jev models. Reading it sends no credential and costs nothing.
 */
export const JEV_DECISIONS_CATALOG_URL = "https://openrouter.ai/api/v1/models?endpoints=/api/alpha/decisions";
/** Newest eligible pinned version on 2026-11-16, used until the first catalog read succeeds. */
export const JEV_FALLBACK_SHADOW_MODEL = "typesafe/jev-1.14";
/** Price guard: the owner-approved price of 1.13 and 1.14 (USD 0.042 per million input tokens). */
export const JEV_MAX_PROMPT_USD_PER_TOKEN = 0.000000042;
export const JEV_MODEL_REFRESH_MS = 86_400_000;
export const JEV_MODEL_RETRY_MS = 3_600_000;
const PINNED_JEV = /^typesafe\/jev-(\d{1,3})\.(\d{1,3})$/;

export interface JevCatalogChoice {
  id: string;
  major: number;
  minor: number;
  promptUsdPerToken: number;
}

export type JevCatalogSelection =
  | { outcome: "SELECTED"; choice: JevCatalogChoice }
  | { outcome: "NO_ELIGIBLE_MODEL" }
  | { outcome: "MALFORMED_CATALOG" };

/**
 * Pick the newest pinned `typesafe/jev-<major>.<minor>` served on the Decisions endpoint whose input price is
 * positive and within the guard and whose every other price is zero. Aliases such as `~typesafe/jev-latest`
 * never qualify: their billing and version can change without notice.
 */
export function selectLatestEligibleJevModel(catalog: unknown): JevCatalogSelection {
  if (!catalog || typeof catalog !== "object" || !Array.isArray((catalog as { data?: unknown }).data)) {
    return { outcome: "MALFORMED_CATALOG" };
  }
  const eligible: JevCatalogChoice[] = [];
  for (const row of (catalog as { data: unknown[] }).data) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id : "";
    const match = PINNED_JEV.exec(id);
    if (!match) continue;
    if (!Array.isArray(record.endpoints) || !record.endpoints.includes("/api/alpha/decisions")) continue;
    const pricing = record.pricing && typeof record.pricing === "object" && !Array.isArray(record.pricing)
      ? record.pricing as Record<string, unknown> : null;
    if (!pricing) continue;
    const prompt = priceOf(pricing.prompt);
    if (prompt === null || prompt <= 0 || prompt > JEV_MAX_PROMPT_USD_PER_TOKEN) continue;
    const otherPrices = Object.entries(pricing).filter(([key]) => key !== "prompt").map(([, value]) => priceOf(value));
    if (otherPrices.some((value) => value === null || value !== 0)) continue;
    eligible.push({ id, major: Number(match[1]), minor: Number(match[2]), promptUsdPerToken: prompt });
  }
  eligible.sort((a, b) => b.major - a.major || b.minor - a.minor);
  return eligible[0] ? { outcome: "SELECTED", choice: eligible[0] } : { outcome: "NO_ELIGIBLE_MODEL" };
}

function priceOf(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  if (typeof value === "string" && !/^\d+(\.\d+)?(e-?\d+)?$/i.test(value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export interface JevShadowModelSelector {
  /** The model to call now, or null while the price guard has no eligible version (calls are skipped). */
  current(): string | null;
  /** Starts a catalog read when one is due; never blocks the caller and never throws. */
  refreshIfDue(): void;
  readonly pinned: boolean;
}

export function createJevShadowModelSelector(options: {
  env?: Readonly<Record<string, string | undefined>>;
  fetchCatalog?: (signal: AbortSignal) => Promise<unknown>;
  now?: () => number;
  log?: (event: Record<string, unknown>) => void;
  timeoutMs?: number;
} = {}): JevShadowModelSelector {
  const env = options.env ?? process.env;
  const now = options.now ?? Date.now;
  const log = options.log ?? ((event: Record<string, unknown>) => console.info(JSON.stringify(event)));
  const fetchCatalog = options.fetchCatalog ?? fetchJevDecisionsCatalog;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const configured = env.MISSION_CONTROL_JEV_SHADOW_MODEL?.trim();
  const pinned = Boolean(configured) && configured !== "auto";
  let model: string | null = pinned ? configured! : JEV_FALLBACK_SHADOW_MODEL;
  let nextCheckAt = 0;
  let inFlight = false;
  log({ event: "jev_shadow_model", model, selection: pinned ? "PINNED" : "AUTOMATIC" });
  return {
    pinned,
    current: () => model,
    refreshIfDue() {
      if (pinned || inFlight || now() < nextCheckAt) return;
      inFlight = true;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      void Promise.resolve()
        .then(() => fetchCatalog(controller.signal))
        .then((catalog) => {
          const selection = selectLatestEligibleJevModel(catalog);
          if (selection.outcome === "MALFORMED_CATALOG") {
            nextCheckAt = now() + JEV_MODEL_RETRY_MS;
            log({ event: "jev_shadow_model_check", outcome: "MALFORMED_CATALOG", model });
            return;
          }
          nextCheckAt = now() + JEV_MODEL_REFRESH_MS;
          const next = selection.outcome === "SELECTED" ? selection.choice.id : null;
          if (next !== model) {
            log({ event: "jev_shadow_model_selected", from: model, to: next,
              reason: next === null ? "NO_ELIGIBLE_MODEL_WITHIN_PRICE_GUARD" : "NEWEST_ELIGIBLE_VERSION" });
            model = next;
          }
        }, () => {
          nextCheckAt = now() + JEV_MODEL_RETRY_MS;
          log({ event: "jev_shadow_model_check", outcome: "CATALOG_UNAVAILABLE", model });
        })
        .finally(() => {
          clearTimeout(timer);
          inFlight = false;
        });
    },
  };
}

async function fetchJevDecisionsCatalog(signal: AbortSignal): Promise<unknown> {
  const response = await fetch(JEV_DECISIONS_CATALOG_URL, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw new Error("Jev Decisions catalog returned HTTP " + response.status);
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("Jev Decisions catalog is unexpectedly large");
  return JSON.parse(text);
}
