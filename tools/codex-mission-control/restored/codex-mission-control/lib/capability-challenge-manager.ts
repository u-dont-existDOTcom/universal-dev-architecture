import { randomBytes, randomUUID } from "node:crypto";

import { canonicalJson } from "./canonical";
import {
  ensureCapabilityChallengeEvidence,
  publicCapabilityChallenge,
  type CapabilitySubject,
  type GitHubReceiptPolicy,
  type PublicCapabilityChallenge,
} from "./github-decision-receipts";
import type { EventStore, StoredCapabilityChallenge } from "./store";

export const capabilityNonceCommentPrefix = "MISSION_CONTROL_CAPABILITY_NONCE_V1\n";
export const defaultCapabilityChallengeTtlMs = 24 * 60 * 60 * 1000;
export const defaultCapabilityChallengeRenewalLeadMs = 5 * 60 * 60 * 1000;

const minimumTtlMs = 6 * 60 * 60 * 1000;
const maximumTtlMs = 7 * 24 * 60 * 60 * 1000;
const minimumRenewalLeadMs = 60 * 60 * 1000;

export interface CapabilityChallengeDurations {
  ttlMs: number;
  renewalLeadMs: number;
}

export interface CapabilityChallengeManagerOptions extends CapabilityChallengeDurations {
  token?: string;
  fetchImpl?: typeof fetch;
  now?: () => string;
  uuid?: () => string;
  nonce?: () => string;
}

interface GitHubPublication {
  commentId: number;
  url: string;
}

export class CapabilityChallengeManager {
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => string;
  private readonly uuid: () => string;
  private readonly nonce: () => string;
  private readonly token: string | undefined;
  private readonly inFlight = new Map<string, Promise<StoredCapabilityChallenge>>();

  constructor(
    private readonly store: EventStore,
    private readonly policy: GitHubReceiptPolicy,
    private readonly options: CapabilityChallengeManagerOptions,
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date().toISOString());
    this.uuid = options.uuid ?? randomUUID;
    this.nonce = options.nonce ?? (() => randomBytes(32).toString("base64url"));
    this.token = options.token?.trim() || undefined;
  }

  async ensureAll(): Promise<StoredCapabilityChallenge[]> {
    return Promise.all(this.policy.capabilitySubjects.map((subject) => this.ensure(subject.supervisorId, subject.chatId)));
  }

  async ensure(supervisorId: string, chatId: string): Promise<StoredCapabilityChallenge> {
    const subject = this.policy.capabilitySubjects.find((item) => item.supervisorId === supervisorId && item.chatId === chatId);
    if (!subject) throw new Error("Capability challenge subject is not statically authorized.");
    const key = `${supervisorId}\0${chatId}`;
    const current = this.inFlight.get(key);
    if (current) return current;
    const operation = this.ensureSubject(subject).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, operation);
    return operation;
  }

  current(supervisorId: string, chatId: string, now = this.now()): PublicCapabilityChallenge | null {
    const challenge = this.store.currentCapabilityChallenge(supervisorId, chatId, now);
    return publicCapabilityChallenge(this.policy, challenge, now);
  }

  exact(challengeId: string, now = this.now()): PublicCapabilityChallenge | null {
    const challenge = this.store.capabilityChallengeById(challengeId);
    if (!challenge || this.store.currentCapabilityChallenge(challenge.supervisorId, challenge.chatId, now)?.challengeId !== challenge.challengeId) return null;
    return publicCapabilityChallenge(this.policy, challenge, now);
  }

  private async ensureSubject(subject: CapabilitySubject): Promise<StoredCapabilityChallenge> {
    const issuedAt = this.now();
    const issuedAtMs = Date.parse(issuedAt);
    if (!Number.isFinite(issuedAtMs)) throw new Error("Capability challenge manager clock returned an invalid timestamp.");
    const healthy = this.store.currentCapabilityChallenge(subject.supervisorId, subject.chatId, issuedAt);
    if (healthy && Date.parse(healthy.expiresAt) > issuedAtMs + this.options.renewalLeadMs) {
      ensureCapabilityChallengeEvidence(this.store, healthy, this.policy, issuedAt);
      return healthy;
    }
    const mcNonce = this.nonce();
    let githubNonce = this.nonce();
    for (let attempt = 0; githubNonce === mcNonce && attempt < 7; attempt += 1) githubNonce = this.nonce();
    if (githubNonce === mcNonce) throw new Error("Capability challenge nonce generator did not produce independent values.");
    const reservation = this.store.reserveCapabilityChallenge({
      challengeId: `capability:${this.uuid()}`,
      supervisorId: subject.supervisorId,
      chatId: subject.chatId,
      worker: subject.worker,
      mcNonce,
      githubNonce,
      issuedAt,
      expiresAt: new Date(issuedAtMs + this.options.ttlMs).toISOString(),
      source: "DYNAMIC",
    }, issuedAt, this.options.renewalLeadMs);
    if (reservation.disposition === "CURRENT") {
      ensureCapabilityChallengeEvidence(this.store, reservation.challenge, this.policy, issuedAt);
      return reservation.challenge;
    }
    const challenge = reservation.challenge;
    let activated: StoredCapabilityChallenge;
    try {
      const publication = await this.publishOrRecover(challenge);
      activated = this.store.activateCapabilityChallenge(challenge.challengeId, publication, this.now());
    } catch (error) {
      this.store.failCapabilityChallenge(challenge.challengeId, publicationFailureCode(error), this.now());
      throw new Error("Capability challenge publication failed; no new challenge was activated.", { cause: error });
    }
    ensureCapabilityChallengeEvidence(this.store, activated, this.policy, activated.activatedAt ?? this.now());
    return activated;
  }

  private async publishOrRecover(challenge: StoredCapabilityChallenge): Promise<GitHubPublication> {
    if (!this.token) throw new Error("MISSION_CONTROL_GITHUB_CAPABILITY_WRITER_TOKEN is required for challenge rotation.");
    const body = capabilityNonceComment(challenge);
    const existing = await this.findExistingPublication(body);
    if (existing) return existing;
    const response = await this.fetchImpl(this.commentsApiUrl(), {
      method: "POST",
      headers: this.githubHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ body }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub capability nonce publication returned HTTP ${response.status}.`);
    return this.verifyPublication(await response.json(), body);
  }

  private async findExistingPublication(body: string): Promise<GitHubPublication | null> {
    const response = await this.fetchImpl(`${this.commentsApiUrl()}?per_page=100&sort=created&direction=desc`, {
      headers: this.githubHeaders(),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`GitHub capability nonce recovery returned HTTP ${response.status}.`);
    const comments = await response.json();
    if (!Array.isArray(comments)) throw new Error("GitHub capability nonce recovery returned an invalid payload.");
    for (const comment of comments) {
      if (isRecord(comment) && comment.body === body) return this.verifyPublication(comment, body);
    }
    return null;
  }

  private verifyPublication(value: unknown, body: string): GitHubPublication {
    if (!isRecord(value) || value.body !== body || !Number.isInteger(value.id) || Number(value.id) <= 0) {
      throw new Error("GitHub capability nonce publication response did not match the exact fixture.");
    }
    const expectedIssueApiUrl = `https://api.github.com/repos/${this.policy.repository}/issues/${this.policy.capabilityIssueNumber}`;
    if (value.issue_url !== expectedIssueApiUrl) throw new Error("GitHub capability nonce publication was not bound to the configured capability issue.");
    if (typeof value.html_url !== "string") throw new Error("GitHub capability nonce publication lacked an immutable URL.");
    const expectedCommentUrl = `https://github.com/${this.policy.repository}/issues/${this.policy.capabilityIssueNumber}#issuecomment-${Number(value.id)}`;
    if (value.html_url !== expectedCommentUrl) throw new Error("GitHub capability nonce publication URL escaped the configured capability issue.");
    return { commentId: Number(value.id), url: value.html_url };
  }

  private commentsApiUrl() {
    return `https://api.github.com/repos/${this.policy.repository}/issues/${this.policy.capabilityIssueNumber}/comments`;
  }

  private githubHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${this.token}`,
      "x-github-api-version": "2022-11-28",
      "user-agent": "mission-control-capability-writer",
      ...extra,
    };
  }
}

export function parseCapabilityChallengeDurations(env: NodeJS.ProcessEnv = process.env): CapabilityChallengeDurations {
  const ttlMs = boundedInteger(env.MISSION_CONTROL_CAPABILITY_CHALLENGE_TTL_MS, defaultCapabilityChallengeTtlMs, minimumTtlMs, maximumTtlMs, "MISSION_CONTROL_CAPABILITY_CHALLENGE_TTL_MS");
  const renewalLeadMs = boundedInteger(
    env.MISSION_CONTROL_CAPABILITY_CHALLENGE_RENEWAL_LEAD_MS,
    defaultCapabilityChallengeRenewalLeadMs,
    minimumRenewalLeadMs,
    Math.min(24 * 60 * 60 * 1000, ttlMs - 60 * 60 * 1000),
    "MISSION_CONTROL_CAPABILITY_CHALLENGE_RENEWAL_LEAD_MS",
  );
  return { ttlMs, renewalLeadMs };
}

export function assertCapabilityWriterCredentialIsolation(
  capabilityWriterToken: string | undefined,
  otherCredentials: Record<string, string | undefined>,
): void {
  const writer = capabilityWriterToken?.trim();
  if (!writer) return;
  for (const [name, value] of Object.entries(otherCredentials)) {
    if (value?.trim() === writer) throw new Error(`Capability writer credential must be distinct from ${name}.`);
  }
}

export function capabilityWriterIsolationCredentialsFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string | undefined> {
  const credentials: Record<string, string | undefined> = {
    "the internal daemon credential": env.MISSION_CONTROL_INTERNAL_TOKEN,
    "the owner credential": env.MISSION_CONTROL_OWNER_TOKEN,
    "the reconciliation credential": env.MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN,
    "the webhook credential": env.MISSION_CONTROL_GITHUB_WEBHOOK_SECRET,
    "the session credential": env.MISSION_CONTROL_SESSION_SECRET,
    "the MCP credential": env.MISSION_CONTROL_MCP_TOKEN,
    "the worker credential": env.MISSION_CONTROL_WORKER_TOKEN,
  };
  const raw = env.MISSION_CONTROL_INGEST_CREDENTIALS;
  if (!raw?.trim()) return credentials;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("MISSION_CONTROL_INGEST_CREDENTIALS must be valid JSON for capability-writer credential isolation.");
  }
  if (!isRecord(parsed)) {
    throw new Error("MISSION_CONTROL_INGEST_CREDENTIALS must be an object for capability-writer credential isolation.");
  }
  let ordinal = 0;
  for (const value of Object.values(parsed)) {
    ordinal += 1;
    if (!isRecord(value) || typeof value.token !== "string") {
      throw new Error("Each Mission Control ingest credential must contain a token for capability-writer credential isolation.");
    }
    credentials[`ingest credential ${ordinal}`] = value.token;
  }
  return credentials;
}

export function capabilityNonceComment(challenge: Pick<StoredCapabilityChallenge, "challengeId" | "chatId" | "githubNonce" | "expiresAt">): string {
  return capabilityNonceCommentPrefix + canonicalJson({
    schema_version: 1,
    challenge_id: challenge.challengeId,
    chat_id: challenge.chatId,
    github_nonce: challenge.githubNonce,
    expires_at: challenge.expiresAt,
  });
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number, field: string): number {
  const parsed = value === undefined || value === "" ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`${field} must be an integer from ${minimum} through ${maximum}.`);
  return parsed;
}

function publicationFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return "CAPABILITY_PUBLICATION_FAILED";
  if (/TOKEN is required/.test(error.message)) return "CAPABILITY_WRITER_TOKEN_MISSING";
  if (/escaped|configured capability issue|bound/.test(error.message)) return "CAPABILITY_PUBLICATION_BINDING_MISMATCH";
  return "CAPABILITY_PUBLICATION_FAILED";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
