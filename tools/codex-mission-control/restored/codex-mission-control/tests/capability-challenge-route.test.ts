import assert from "node:assert/strict";
import test from "node:test";

import * as capabilityRoute from "../app/api/capability-challenges/[challenge]/route";
import { GET as getWorker } from "../app/api/workers/[worker]/route";
import {
  capabilityReceiptCommentPrefix,
  ingestGitHubSupervisionCandidate,
  parseGitHubReceiptPolicy,
  publicCapabilityChallenge,
  type GitHubDecisionCandidate,
  type GitHubReceiptPolicy,
} from "../lib/github-decision-receipts";

const allowedFields = [
  "challenge_id",
  "chat_id",
  "expires_at",
  "github_nonce_sha256",
  "github_nonce_source",
  "mc_nonce",
  "receipt_target",
  "schema_version",
];

test("public exact-ID capability route returns only the disposable allowlist without owner auth", async () => {
  await withPolicy(policy(), async () => {
    const response = await capabilityRoute.GET(
      new Request("https://mission-control.example/api/capability-challenges/challenge-spec"),
      { params: Promise.resolve({ challenge: "challenge-spec" }) },
    );
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(body).sort(), allowedFields);
    assert.deepEqual(body, {
      schema_version: 1,
      challenge_id: "challenge-spec",
      chat_id: "spec",
      mc_nonce: "mc-nonce",
      github_nonce_sha256: "ce36f950fdf271088e9d8b84266f181396dc8e8242ae68c940d91cfe067964a1",
      github_nonce_source: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/60",
      receipt_target: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/60",
      expires_at: "2099-09-05T00:00:00.000Z",
    });
    assert.match(response.headers.get("cache-control") ?? "", /no-store/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  });
});

test("unknown and expired capability challenges fail closed", async () => {
  await withPolicy(policy(), async () => {
    const unknown = await capabilityRoute.GET(
      new Request("https://mission-control.example/api/capability-challenges/unknown"),
      { params: Promise.resolve({ challenge: "unknown" }) },
    );
    assert.equal(unknown.status, 404);
  });
  await withPolicy(policy("2000-01-01T00:00:00.000Z"), async () => {
    const expired = await capabilityRoute.GET(
      new Request("https://mission-control.example/api/capability-challenges/challenge-spec"),
      { params: Promise.resolve({ challenge: "challenge-spec" }) },
    );
    assert.equal(expired.status, 404);
  });
});

test("ambiguous duplicate challenge IDs fail configuration closed instead of selecting one", () => {
  const configured = policy();
  configured.capabilityChallenges.push({
    ...configured.capabilityChallenges[0]!,
    chatId: "other-chat",
  });
  assert.throws(() => parseGitHubReceiptPolicy(JSON.stringify(configured)), /challenge IDs must be unique/);
});

test("capability projection leaks no worker, timeline, credential, task, decision, session, environment, or arbitrary refs", () => {
  const configured = policy();
  const result = publicCapabilityChallenge(configured, "challenge-spec", "2026-09-03T00:00:00.000Z");
  assert.ok(result);
  const serialized = JSON.stringify(result);
  for (const forbidden of [
    configured.capabilityChallenges[0]!.worker,
    "timeline",
    "credential",
    "token",
    "Railway",
    "owner",
    "session",
    "task",
    "decision",
    "refs",
    "github-only-nonce",
  ]) assert.equal(serialized.includes(forbidden), false, `leaked forbidden value ${forbidden}`);
});

test("capability endpoint is non-mutating and exports no mutation method", async () => {
  const configured = policy();
  const before = structuredClone(configured);
  assert.ok(publicCapabilityChallenge(configured, "challenge-spec", "2026-09-03T00:00:00.000Z"));
  assert.deepEqual(configured, before);
  const exports = capabilityRoute as unknown as Record<string, unknown>;
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) assert.equal(exports[method], undefined);
});

test("existing worker route still requires owner authentication", async () => {
  await withEnv({
    MISSION_CONTROL_OWNER_TOKEN: "o".repeat(32),
    MISSION_CONTROL_SESSION_SECRET: "s".repeat(32),
  }, async () => {
    const response = await getWorker(
      new Request("https://mission-control.example/api/workers/worker-a"),
      { params: Promise.resolve({ worker: "worker-a" }) },
    );
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", /Mission Control owner/);
  });
});

test("public challenge projection does not weaken capability receipt writer, nonce, expiry, or order checks", () => {
  const configured = policy();
  assert.ok(publicCapabilityChallenge(configured, "challenge-spec", "2026-09-03T00:00:00.000Z"));
  const base = candidate(capabilityBody());
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(), { ...base, authorLogin: "unauthorized" }, configured), /not authorized/);
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(), candidate(capabilityBody({ mc_nonce: "wrong" })), configured), /nonce mismatch/);
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(), { ...base, createdAt: "2100-01-01T00:00:00.000Z" }, configured), /expired/);
  assert.throws(() => ingestGitHubSupervisionCandidate(fakeStore(), candidate(capabilityBody({ capabilities: ["GITHUB_READ", "MISSION_CONTROL_READ", "GITHUB_WRITE"] })), configured), /exact ordered/);
});

function policy(expiresAt = "2099-09-05T00:00:00.000Z"): GitHubReceiptPolicy {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    decisionIssueNumber: 59,
    capabilityIssueNumber: 60,
    stageIssueNumber: 61,
    authorizedWriterLogins: ["u-dont-existDOTcom"],
    capabilityChallenges: [{
      challengeId: "challenge-spec",
      chatId: "spec",
      worker: "mission-control-live-slice",
      mcNonce: "mc-nonce",
      githubNonce: "github-only-nonce",
      expiresAt,
      extraHighLabel: "Extra High",
      proLabel: "Pro",
    }],
  };
}

function capabilityBody(overrides: Record<string, unknown> = {}) {
  return `${capabilityReceiptCommentPrefix}${JSON.stringify({
    schema_version: 1,
    challenge_id: "challenge-spec",
    chat_id: "spec",
    mc_nonce: "mc-nonce",
    github_nonce: "github-only-nonce",
    capabilities: ["MISSION_CONTROL_READ", "GITHUB_READ", "GITHUB_WRITE"],
    ...overrides,
  })}`;
}

function candidate(body: string): GitHubDecisionCandidate {
  return {
    repository: "u-dont-existDOTcom/universal-dev-architecture",
    issueNumber: 60,
    commentId: 1,
    immutableUrl: "https://github.com/u-dont-existDOTcom/universal-dev-architecture/issues/60#issuecomment-1",
    createdAt: "2026-09-03T00:01:00.000Z",
    authorLogin: "u-dont-existDOTcom",
    deliveryId: null,
    body,
    ingestionMethod: "RECONCILIATION_POLL",
  };
}

function fakeStore() {
  return {
    allEvents: () => [],
    append: (value: unknown) => value,
  } as never;
}

async function withPolicy(value: GitHubReceiptPolicy, action: () => Promise<void>) {
  return withEnv({ MISSION_CONTROL_GITHUB_RECEIPT_POLICY_JSON: JSON.stringify(value) }, action);
}

async function withEnv(values: Record<string, string>, action: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await action();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}
