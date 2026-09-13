import { createHash } from "node:crypto";
import { request as httpRequest, type RequestOptions } from "node:http";
import type { PublicationProof } from "./capability-rotation-store";
import { nonceFixtureBody, capabilityNoncePrefix, type NonceFixture, type CapabilityNoncePublisher } from "./capability-rotation";

export type { PublicationProof } from "./capability-rotation-store";
export type { CapabilityNoncePublisher, NonceFixture } from "./capability-rotation";
export type CapabilityNonceFixture = NonceFixture;
export { capabilityNoncePrefix } from "./capability-rotation";

// NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT. These are authority, not client options.
export const capabilityNonceRepository = "u-dont-existDOTcom/universal-dev-architecture";
export const capabilityNonceIssue = 60;
export const capabilityNonceWriter = "u-dont-existDOTcom";
const apiRoot = `https://api.github.com/repos/${capabilityNonceRepository}`;
const issueApi = `${apiRoot}/issues/${capabilityNonceIssue}`;
const issueWeb = `https://github.com/${capabilityNonceRepository}/issues/${capabilityNonceIssue}`;
export const capabilityNonceBrokerPath = "/v1/capability-nonce";
export const capabilityNonceBrokerMaxBytes = 8192;
// Matches CapabilityRotationRuntime's enforced maximum TTL. Also enforced on
// publication proofs here: anything older is NOT eligible for recovery/activation.
export const capabilityNonceMaximumLifetimeMs = 172_800_000;
const publicationClockSkewMs = 5000;
const errorCodes = [
  "CAPABILITY_PUBLISHER_UNAVAILABLE", "CAPABILITY_PUBLICATION_INVALID", "CAPABILITY_PUBLICATION_AMBIGUOUS",
  "CAPABILITY_PUBLICATION_PAGINATION_INCOMPLETE", "CAPABILITY_PUBLISHER_INVALID_REQUEST",
  "CAPABILITY_PUBLISHER_RESPONSE_TOO_LARGE", "CAPABILITY_PUBLISHER_TIMEOUT",
] as const;
type ErrorCode = typeof errorCodes[number];
export class CapabilityNoncePublicationError extends Error {
  constructor(readonly code: ErrorCode) { super(code); this.name = "CapabilityNoncePublicationError"; }
}
function fail(code: ErrorCode): never { throw new CapabilityNoncePublicationError(code); }
export function capabilityNonceErrorCode(error: unknown): ErrorCode {
  return error instanceof CapabilityNoncePublicationError ? error.code : "CAPABILITY_PUBLISHER_UNAVAILABLE";
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("CAPABILITY_PUBLISHER_INVALID_REQUEST");
  return value as Record<string, unknown>;
}
function exactKeys(value: unknown, keys: string[]): Record<string, unknown> {
  const result = object(value);
  if (Object.keys(result).length !== keys.length || !keys.every((key) => Object.hasOwn(result, key))) fail("CAPABILITY_PUBLISHER_INVALID_REQUEST");
  return result;
}
function timestamp(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)
    || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value.replace(/(?<=:\d{2})Z$/, ".000Z")) fail("CAPABILITY_PUBLICATION_INVALID");
  return value;
}
export function validateCapabilityNonceFixture(value: unknown): CapabilityNonceFixture {
  const root = exactKeys(value, ["challengeId", "chatId", "githubNonce", "expiresAt"]);
  if (typeof root.challengeId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(root.challengeId)
    || typeof root.chatId !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,179}$/.test(root.chatId)) fail("CAPABILITY_PUBLISHER_INVALID_REQUEST");
  if (typeof root.githubNonce !== "string" || !/^[A-Za-z0-9_-]{32,256}$/.test(root.githubNonce)) fail("CAPABILITY_PUBLISHER_INVALID_REQUEST");
  // The single writer must supply an already-authorized PUBLIC chat alias, not a locator.
  return { challengeId: root.challengeId as string, chatId: root.chatId as string, githubNonce: root.githubNonce, expiresAt: timestamp(root.expiresAt) };
}
export function capabilityNonceBody(value: CapabilityNonceFixture): string {
  const fixture = validateCapabilityNonceFixture(value);
  return nonceFixtureBody(fixture);
}
function hash(body: string): string { return createHash("sha256").update(body, "utf8").digest("hex"); }
function earliestPublicationMs(fixture: CapabilityNonceFixture): number {
  return Date.parse(fixture.expiresAt) - capabilityNonceMaximumLifetimeMs - publicationClockSkewMs;
}
export function capabilityNonceDiscoverySince(input: CapabilityNonceFixture): string {
  const fixture = validateCapabilityNonceFixture(input);
  // GitHub's `since` is an exclusive UPDATED-at filter. Updated-at >= created-at,
  // so a floor strictly before every admissible creation cannot omit a valid proof.
  // Round down and include an extra second to preserve boundary/precision equality.
  return new Date(Math.floor(earliestPublicationMs(fixture) / 1000) * 1000 - 1000).toISOString();
}
function validateProof(value: unknown, fixture: CapabilityNonceFixture, now: number): PublicationProof {
  const proof = exactKeys(value, ["commentId", "immutableUrl", "bodySha256", "authorLogin", "createdAt"]);
  if (!Number.isSafeInteger(proof.commentId) || (proof.commentId as number) <= 0
    || proof.immutableUrl !== `${issueWeb}#issuecomment-${proof.commentId}`
    || proof.bodySha256 !== hash(capabilityNonceBody(fixture))
    || typeof proof.authorLogin !== "string" || proof.authorLogin.toLowerCase() !== capabilityNonceWriter.toLowerCase()) fail("CAPABILITY_PUBLICATION_INVALID");
  const createdAt = timestamp(proof.createdAt);
  if (Date.parse(createdAt) < earliestPublicationMs(fixture) || Date.parse(createdAt) >= Date.parse(fixture.expiresAt) || Date.parse(createdAt) > now) fail("CAPABILITY_PUBLICATION_INVALID");
  return { commentId: proof.commentId as number, immutableUrl: proof.immutableUrl as string, bodySha256: proof.bodySha256 as string, authorLogin: proof.authorLogin, createdAt };
}
function verifyComment(value: unknown, fixture: CapabilityNonceFixture, now: number): PublicationProof {
  const comment = object(value), user = object(comment.user);
  if (comment.issue_url !== issueApi || comment.url !== `${apiRoot}/issues/comments/${comment.id}`
    || comment.body !== capabilityNonceBody(fixture)) fail("CAPABILITY_PUBLICATION_INVALID");
  return validateProof({ commentId: comment.id, immutableUrl: comment.html_url, bodySha256: hash(comment.body as string), authorLogin: user.login, createdAt: comment.created_at }, fixture, now);
}
function equalProof(left: PublicationProof, right: PublicationProof): boolean {
  return (Object.keys(left) as (keyof PublicationProof)[]).every((key) => left[key] === right[key]);
}
async function deadline<T>(operation: () => Promise<T>, timeoutMs: number, onTimeout = () => {}): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { onTimeout(); reject(new CapabilityNoncePublicationError("CAPABILITY_PUBLISHER_TIMEOUT")); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}
function boundedInteger(value: number, max: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail("CAPABILITY_PUBLISHER_INVALID_REQUEST");
  return value;
}
async function boundedResponse(response: Response, maximum: number): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maximum)) {
    void response.body?.cancel().catch(() => {});
    fail("CAPABILITY_PUBLISHER_RESPONSE_TOO_LARGE");
  }
  if (!response.body) fail("CAPABILITY_PUBLICATION_INVALID");
  const reader = response.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximum) fail("CAPABILITY_PUBLISHER_RESPONSE_TOO_LARGE");
      chunks.push(value);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { fail("CAPABILITY_PUBLICATION_INVALID"); }
  } finally { void reader.cancel().catch(() => {}); reader.releaseLock(); }
}

/** Broker-only implementation. No credential reading, ambient gh token, or arbitrary URL API. */
export class FixedBusCapabilityNoncePublisher implements CapabilityNoncePublisher {
  private readonly timeoutMs: number;
  private readonly maxPages: number;
  private readonly maxResponseBytes: number;
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  #credential: string;
  private writerVerified = false;
  constructor(credential: string, options: { fetch?: typeof fetch; now?: () => number; timeoutMs?: number; maxPages?: number; maxResponseBytes?: number } = {}) {
    // A fine-grained PAT is necessary, not proof of scope. The owner must provision this
    // token for this ONE repository with only Issues:write (and implicit metadata:read).
    // GitHub cannot restrict a PAT to one issue/create-only: this broker enforces that cut.
    if (!/^github_pat_[A-Za-z0-9_]{20,255}$/.test(credential)) fail("CAPABILITY_PUBLISHER_UNAVAILABLE");
    this.#credential = credential;
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.timeoutMs = boundedInteger(options.timeoutMs ?? 10_000, 30_000);
    this.maxPages = boundedInteger(options.maxPages ?? 20, 50);
    this.maxResponseBytes = boundedInteger(options.maxResponseBytes ?? 1_048_576, 4_194_304);
  }
  async verifyWriter(): Promise<void> {
    if (this.writerVerified) return;
    // Fixed read-only identity probe, not a general API proxy or a claim about PAT scopes.
    const { value } = await this.api("https://api.github.com/user");
    const user = object(value);
    if (typeof user.login !== "string" || user.login.toLowerCase() !== capabilityNonceWriter.toLowerCase()) fail("CAPABILITY_PUBLICATION_INVALID");
    this.writerVerified = true;
  }
  private async api(url: string, body?: string): Promise<{ value: unknown; link: string | null }> {
    const controller = new AbortController();
    try {
      return await deadline(async () => {
        const response = await this.fetcher(url, {
          method: body === undefined ? "GET" : "POST", redirect: "error", signal: controller.signal,
          headers: { accept: "application/vnd.github+json", authorization: `Bearer ${this.#credential}`, "x-github-api-version": "2022-11-28", "user-agent": "mission-control-capability-nonce-broker", ...(body === undefined ? {} : { "content-type": "application/json" }) },
          ...(body === undefined ? {} : { body: JSON.stringify({ body }) }),
        });
        // Never parse, log, or return an error response body. No retry, including 429/5xx.
        if (response.status !== (body === undefined ? 200 : 201) || response.redirected || (response.url && response.url !== url)) {
          void response.body?.cancel().catch(() => {});
          fail("CAPABILITY_PUBLICATION_INVALID");
        }
        return { value: await boundedResponse(response, this.maxResponseBytes), link: response.headers.get("link") };
      }, this.timeoutMs, () => controller.abort());
    } catch (error) {
      // A failed POST or read-after-POST may already have published. The daemon must
      // retain PUBLISHING and reconcile with find; this component never retries a write.
      throw new CapabilityNoncePublicationError(body === undefined ? capabilityNonceErrorCode(error) : "CAPABILITY_PUBLICATION_AMBIGUOUS");
    }
  }
  async find(input: CapabilityNonceFixture): Promise<PublicationProof | null> {
    const fixture = validateCapabilityNonceFixture(input);
    const since = capabilityNonceDiscoverySince(fixture);
    let found: PublicationProof | null = null;
    for (let page = 1; page <= this.maxPages; page++) {
      const { value, link } = await this.api(`${issueApi}/comments?per_page=100&page=${page}&since=${encodeURIComponent(since)}`);
      if (!Array.isArray(value) || value.length > 100) fail("CAPABILITY_PUBLICATION_INVALID");
      for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const comment = item as Record<string, unknown>;
        if (typeof comment.body !== "string") continue;
        if (!comment.body.startsWith(capabilityNoncePrefix)) continue;
        const author = comment.user && typeof comment.user === "object" ? (comment.user as Record<string, unknown>).login : null;
        if (typeof author !== "string" || author.toLowerCase() !== capabilityNonceWriter.toLowerCase()) continue;
        let parsed: Record<string, unknown>;
        try { parsed = object(JSON.parse(comment.body.slice(capabilityNoncePrefix.length))); }
        catch { continue; } // Public bus noise is not a proof or an exact-ID conflict.
        if (parsed.challenge_id !== fixture.challengeId) continue;
        const proof = verifyComment(comment, fixture, this.now());
        if (found) fail("CAPABILITY_PUBLICATION_AMBIGUOUS");
        found = proof;
      }
      let hasNext = false;
      if (link) {
        const seen = new Set<string>();
        for (const entry of link.split(",")) {
          const match = /^\s*<([^>]+)>;\s*rel="(next|prev|first|last)"\s*$/.exec(entry);
          if (!match || seen.has(match[2])) fail("CAPABILITY_PUBLICATION_PAGINATION_INCOMPLETE");
          seen.add(match[2]);
          let target: URL;
          try { target = new URL(match[1]); } catch { fail("CAPABILITY_PUBLICATION_PAGINATION_INCOMPLETE"); }
          const pageText = target.searchParams.get("page");
          if (target.origin + target.pathname !== `${issueApi}/comments` || target.hash || target.username || target.password
            || target.searchParams.size !== 3 || target.searchParams.get("per_page") !== "100" || target.searchParams.get("since") !== since
            || !pageText || !/^[1-9]\d*$/.test(pageText)
            || !Number.isSafeInteger(Number(pageText)) || (match[2] === "next" && Number(pageText) !== page + 1)) fail("CAPABILITY_PUBLICATION_PAGINATION_INCOMPLETE");
          if (match[2] === "next") hasNext = true;
          if (match[2] === "last" && Number(pageText) > page) hasNext = true;
        }
      }
      // A full page without Link is not exhaustion evidence. Probe the next fixed URL.
      if (!hasNext && value.length < 100) return found ? this.verify(fixture, found) : null;
    }
    // A bounded recent-window overload is a visible fail-closed condition, never
    // `null` and never permission to publish again. Historical total bus size is
    // irrelevant; a retained proof is rechecked directly by exact comment ID.
    fail("CAPABILITY_PUBLICATION_PAGINATION_INCOMPLETE");
  }
  async publish(input: CapabilityNonceFixture): Promise<PublicationProof> {
    const fixture = validateCapabilityNonceFixture(input);
    if (Date.parse(fixture.expiresAt) <= this.now() || Date.parse(fixture.expiresAt) - this.now() > capabilityNonceMaximumLifetimeMs) fail("CAPABILITY_PUBLICATION_INVALID");
    await this.verifyWriter(); // A mismatched actor must be rejected before any write.
    try {
      const { value } = await this.api(`${issueApi}/comments`, capabilityNonceBody(fixture));
      return await this.verify(fixture, verifyComment(value, fixture, this.now()));
    } catch { fail("CAPABILITY_PUBLICATION_AMBIGUOUS"); }
  }
  async verify(input: CapabilityNonceFixture, inputProof: PublicationProof): Promise<PublicationProof> {
    const fixture = validateCapabilityNonceFixture(input), proof = validateProof(inputProof, fixture, this.now());
    const { value } = await this.api(`${apiRoot}/issues/comments/${proof.commentId}`);
    const verified = verifyComment(value, fixture, this.now());
    if (!equalProof(verified, proof)) fail("CAPABILITY_PUBLICATION_INVALID");
    return verified;
  }
}

export interface CapabilityNonceUnixRequest {
  socketPath: string; body: string; timeoutMs: number; maxResponseBytes: number;
}
export type CapabilityNonceUnixTransport = (request: CapabilityNonceUnixRequest) => Promise<unknown>;
export function requestCapabilityNonceBroker(options: CapabilityNonceUnixRequest, requestImpl: typeof httpRequest = httpRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(value);
    };
    const config: RequestOptions = { socketPath: options.socketPath, path: capabilityNonceBrokerPath, method: "POST", agent: false,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(options.body), connection: "close" } };
    const request = requestImpl(config, (response) => {
      const chunks: Buffer[] = []; let size = 0;
      const stop = (code: ErrorCode) => { finish(new CapabilityNoncePublicationError(code)); response.destroy(); request.destroy(); };
      if (response.statusCode !== 200 || response.headers["content-type"] !== "application/json") { stop("CAPABILITY_PUBLISHER_UNAVAILABLE"); return; }
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > options.maxResponseBytes) { stop("CAPABILITY_PUBLISHER_RESPONSE_TOO_LARGE"); return; }
        chunks.push(chunk);
      });
      response.on("error", () => finish(new CapabilityNoncePublicationError("CAPABILITY_PUBLISHER_UNAVAILABLE")));
      response.on("aborted", () => finish(new CapabilityNoncePublicationError("CAPABILITY_PUBLISHER_UNAVAILABLE")));
      response.on("end", () => {
        try { finish(undefined, JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch { finish(new CapabilityNoncePublicationError("CAPABILITY_PUBLICATION_INVALID")); }
      });
    });
    request.on("error", () => finish(new CapabilityNoncePublicationError("CAPABILITY_PUBLISHER_UNAVAILABLE")));
    timer = setTimeout(() => { finish(new CapabilityNoncePublicationError("CAPABILITY_PUBLISHER_TIMEOUT")); request.destroy(); }, options.timeoutMs);
    request.end(options.body);
  });
}

/** Credential-free daemon client. Broker absence is a closed gate, never ambient auth. */
export class UnixCapabilityNoncePublisher implements CapabilityNoncePublisher {
  private readonly timeoutMs: number;
  private readonly transport: CapabilityNonceUnixTransport;
  private readonly now: () => number;
  constructor(private readonly socketPath: string, options: { request?: CapabilityNonceUnixTransport; timeoutMs?: number; now?: () => number } = {}) {
    this.timeoutMs = boundedInteger(options.timeoutMs ?? 30_000, 600_000);
    this.transport = options.request ?? requestCapabilityNonceBroker;
    this.now = options.now ?? Date.now;
  }
  private async call(operation: "find" | "publish" | "verify", input: CapabilityNonceFixture, inputProof?: PublicationProof): Promise<PublicationProof | null> {
    if (!this.socketPath || !this.socketPath.startsWith("/") || this.socketPath.includes("\0") || Buffer.byteLength(this.socketPath) > 103) fail("CAPABILITY_PUBLISHER_UNAVAILABLE");
    const fixture = validateCapabilityNonceFixture(input);
    const proof = inputProof === undefined ? undefined : validateProof(inputProof, fixture, this.now());
    const body = JSON.stringify({ operation, fixture, ...(proof === undefined ? {} : { proof }) });
    try {
      const result = await deadline(() => this.transport({ socketPath: this.socketPath, body, timeoutMs: this.timeoutMs, maxResponseBytes: capabilityNonceBrokerMaxBytes }), this.timeoutMs);
      if (Buffer.byteLength(JSON.stringify(result) ?? "") > capabilityNonceBrokerMaxBytes) fail("CAPABILITY_PUBLISHER_RESPONSE_TOO_LARGE");
      const envelope = object(result);
      if (envelope.ok === false) {
        exactKeys(envelope, ["ok", "error"]);
        fail(errorCodes.includes(envelope.error as ErrorCode) ? envelope.error as ErrorCode : "CAPABILITY_PUBLISHER_UNAVAILABLE");
      }
      exactKeys(envelope, ["ok", "proof"]);
      if (envelope.ok !== true || (envelope.proof === null && operation !== "find")) fail("CAPABILITY_PUBLICATION_INVALID");
      if (envelope.proof === null) return null;
      const verified = validateProof(envelope.proof, fixture, this.now());
      if (proof && !equalProof(proof, verified)) fail("CAPABILITY_PUBLICATION_INVALID");
      return verified;
    } catch (error) { throw new CapabilityNoncePublicationError(capabilityNonceErrorCode(error)); }
  }
  find(fixture: CapabilityNonceFixture) { return this.call("find", fixture); }
  async publish(fixture: CapabilityNonceFixture) { return (await this.call("publish", fixture))!; }
  async verify(fixture: CapabilityNonceFixture, proof: PublicationProof) { return (await this.call("verify", fixture, proof))!; }
}

/** Strict broker dispatch: no client-provided repository, issue, body, URL or token. */
export async function dispatchCapabilityNonceBrokerRequest(input: unknown, publisher: CapabilityNoncePublisher): Promise<PublicationProof | null> {
  const request = object(input);
  if (!["find", "publish", "verify"].includes(request.operation as string)) fail("CAPABILITY_PUBLISHER_INVALID_REQUEST");
  exactKeys(request, request.operation === "verify" ? ["operation", "fixture", "proof"] : ["operation", "fixture"]);
  const fixture = validateCapabilityNonceFixture(request.fixture);
  if (request.operation === "find") return publisher.find(fixture);
  if (request.operation === "publish") return publisher.publish(fixture);
  const proof = validateProof(request.proof, fixture, Date.now());
  return publisher.verify(fixture, proof);
}
