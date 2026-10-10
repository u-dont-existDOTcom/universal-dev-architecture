import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import { readFileSync } from "node:fs";

import {
  GitHubAppBotWriterNotAuthorizedError,
  GitHubAppInstallationTokenProvider,
  githubDecisionCopyTokenProviderFromEnv,
  githubReconciliationTokenProviderFromEnv,
} from "../lib/github-app-auth";
import { reconcileGitHubDecisionReceipts, type GitHubReceiptPolicy } from "../lib/github-decision-receipts";
import { EventStore } from "../lib/store";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

test("GitHub App provider signs a bounded JWT, requests least-privilege repository access, and caches the token", async () => {
  let nowMs = Date.parse("2026-10-05T00:00:00.000Z");
  const tokens = ["installation-token-one", "installation-token-two"];
  const authorizationHeaders: string[] = [];
  const requestBodies: unknown[] = [];
  const provider = new GitHubAppInstallationTokenProvider({
    appId: "123456",
    installationId: "789012",
    privateKeyPem,
    repository: "owner/private-receipts",
    now: () => nowMs,
    fetchImpl: async (input, init) => {
      assert.equal(String(input), "https://api.github.com/app/installations/789012/access_tokens");
      assert.equal(init?.method, "POST");
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("accept"), "application/vnd.github+json");
      assert.equal(headers.get("content-type"), "application/json");
      const authorization = headers.get("authorization");
      assert.ok(authorization?.startsWith("Bearer "));
      authorizationHeaders.push(authorization!);
      requestBodies.push(JSON.parse(String(init?.body)));
      const token = tokens[authorizationHeaders.length - 1]!;
      return Response.json({ token, expires_at: new Date(nowMs + 60 * 60_000).toISOString() });
    },
  });

  assert.equal(await provider.token(), tokens[0]);
  assert.equal(await provider.token(), tokens[0]);
  assert.equal(authorizationHeaders.length, 1);
  assert.deepEqual(requestBodies, [{ repositories: ["private-receipts"], permissions: { issues: "read" } }]);

  const jwt = authorizationHeaders[0]!.slice("Bearer ".length);
  const [header, payload, signature] = jwt.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header!, "base64url").toString("utf8")), { alg: "RS256", typ: "JWT" });
  assert.deepEqual(JSON.parse(Buffer.from(payload!, "base64url").toString("utf8")), {
    iat: Math.floor(Date.parse("2026-10-05T00:00:00.000Z") / 1000) - 60,
    exp: Math.floor(Date.parse("2026-10-05T00:00:00.000Z") / 1000) - 60 + 9 * 60,
    iss: "123456",
  });
  assert.equal(verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature!, "base64url")), true);

  nowMs += 56 * 60_000;
  assert.equal(await provider.token(), tokens[1]);
  assert.equal(authorizationHeaders.length, 2, "the provider must renew inside the five-minute safety window");
});

test("GitHub App provider requests issue write permission only when the deterministic copier needs it", async () => {
  let body: unknown;
  const provider = new GitHubAppInstallationTokenProvider({
    appId: "123456",
    installationId: "789012",
    privateKeyPem,
    repository: "owner/private-receipts",
    issuesPermission: "write",
    now: () => Date.parse("2026-10-05T00:00:00.000Z"),
    fetchImpl: async (_input, init) => {
      body = JSON.parse(String(init?.body));
      return Response.json({ token: "write-token", expires_at: "2026-10-05T01:00:00.000Z" });
    },
  });

  assert.equal(await provider.token(), "write-token");
  assert.deepEqual(body, { repositories: ["private-receipts"], permissions: { issues: "write" } });
});

test("environment factory fails closed on ambiguous or partial GitHub authentication and preserves static-token compatibility", async () => {
  assert.throws(() => githubReconciliationTokenProviderFromEnv({
    repository: "owner/repo",
    env: { MISSION_CONTROL_GITHUB_APP_ID: "1" },
  }), /requires App ID, installation ID, and private-key path together/);
  assert.throws(() => githubReconciliationTokenProviderFromEnv({
    repository: "owner/repo",
    env: {
      MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN: "static",
      MISSION_CONTROL_GITHUB_APP_ID: "1",
      MISSION_CONTROL_GITHUB_APP_INSTALLATION_ID: "2",
      MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH: "/private/key.pem",
    },
  }), /either a static GitHub reconciliation token or GitHub App authentication/);

  const staticProvider = githubReconciliationTokenProviderFromEnv({
    repository: "owner/repo",
    env: { MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN: " static-token " },
  });
  assert.equal(await staticProvider?.(), "static-token");

  let readPath = "";
  const appProvider = githubReconciliationTokenProviderFromEnv({
    repository: "owner/repo",
    env: {
      MISSION_CONTROL_GITHUB_APP_ID: "1",
      MISSION_CONTROL_GITHUB_APP_INSTALLATION_ID: "2",
      MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH: "/private/key.pem",
    },
    readFile: (path) => { readPath = path; return privateKeyPem; },
    fetchImpl: async () => Response.json({ token: "app-token", expires_at: "2026-10-05T01:00:00.000Z" }),
    now: () => Date.parse("2026-10-05T00:00:00.000Z"),
  });
  assert.equal(readPath, "/private/key.pem");
  assert.equal(await appProvider?.(), "app-token");
});

test("App copying requires its exact bot login in the writer policy before token or key access", async () => {
  let keyReads = 0, tokenRequests = 0;
  const env = { MISSION_CONTROL_GITHUB_APP_ID: "1", MISSION_CONTROL_GITHUB_APP_INSTALLATION_ID: "2",
    MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH: "/private/key.pem", MISSION_CONTROL_GITHUB_APP_BOT_LOGIN: "mission-control-app[bot]" };
  const options = { repository: "owner/repo", env, issuesPermission: "write" as const,
    authorizedWriterLogins: ["owner"], readFile: () => { keyReads += 1; return privateKeyPem; },
    now: () => Date.parse("2026-10-05T00:00:00.000Z"),
    fetchImpl: (async () => { tokenRequests += 1; return Response.json({ token: "write-token", expires_at: "2026-10-05T01:00:00.000Z" }); }) as typeof fetch };
  for (const botLogin of [undefined, "mission-control-app", "other-app[bot]", env.MISSION_CONTROL_GITHUB_APP_BOT_LOGIN]) {
    assert.throws(() => githubReconciliationTokenProviderFromEnv({ ...options,
      env: { ...env, MISSION_CONTROL_GITHUB_APP_BOT_LOGIN: botLogin } }), /BOT_LOGIN in receipt-policy authorizedWriterLogins/);
  }
  assert.equal(keyReads, 0);
  assert.equal(tokenRequests, 0);
  const provider = githubReconciliationTokenProviderFromEnv({ ...options,
    authorizedWriterLogins: ["owner", env.MISSION_CONTROL_GITHUB_APP_BOT_LOGIN] });
  assert.equal(await provider?.(), "write-token");
  assert.equal(keyReads, 1);
  assert.equal(tokenRequests, 1);
});

test("decision copying stays off without a trusted App bot writer instead of stopping the daemon", async () => {
  let keyReads = 0, tokenRequests = 0;
  const appEnv = { MISSION_CONTROL_GITHUB_APP_ID: "1", MISSION_CONTROL_GITHUB_APP_INSTALLATION_ID: "2",
    MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH: "/private/key.pem" };
  const base = { repository: "owner/repo", readFile: () => { keyReads += 1; return privateKeyPem; },
    now: () => Date.parse("2026-10-05T00:00:00.000Z"),
    fetchImpl: (async () => { tokenRequests += 1; return Response.json({ token: "write-token", expires_at: "2026-10-05T01:00:00.000Z" }); }) as typeof fetch };
  const untrusted: Array<[string | undefined, string[]]> = [
    [undefined, ["owner"]], // App credentials without a bot login: the live configuration on 2026-10-10
    ["mission-control-app[bot]", ["owner"]], // a bot login the receipt policy does not trust
    ["mission-control-app", ["owner", "mission-control-app"]], // not a [bot] login
  ];
  for (const [botLogin, writers] of untrusted) {
    const env = { ...appEnv, MISSION_CONTROL_GITHUB_APP_BOT_LOGIN: botLogin };
    const copy = githubDecisionCopyTokenProviderFromEnv({ ...base, env, authorizedWriterLogins: writers });
    assert.equal(copy.provider, null);
    assert.match(copy.disabledReason ?? "", /BOT_LOGIN in receipt-policy authorizedWriterLogins/);
    assert.throws(() => githubReconciliationTokenProviderFromEnv({ ...base, env, authorizedWriterLogins: writers,
      issuesPermission: "write" }), GitHubAppBotWriterNotAuthorizedError);
  }
  assert.equal(keyReads, 0);
  assert.equal(tokenRequests, 0);

  const trusted = githubDecisionCopyTokenProviderFromEnv({ ...base, authorizedWriterLogins: ["owner", "mission-control-app[bot]"],
    env: { ...appEnv, MISSION_CONTROL_GITHUB_APP_BOT_LOGIN: "mission-control-app[bot]" } });
  assert.equal(trusted.disabledReason, null);
  assert.equal(await trusted.provider?.(), "write-token");
  assert.equal(keyReads, 1);

  // Only the missing bot writer is softened; every other configuration error still stops startup.
  assert.throws(() => githubDecisionCopyTokenProviderFromEnv({ ...base, authorizedWriterLogins: ["owner"],
    env: { MISSION_CONTROL_GITHUB_APP_ID: "1" } }), /App ID, installation ID, and private-key path together/);
  assert.throws(() => githubDecisionCopyTokenProviderFromEnv({ ...base, authorizedWriterLogins: ["owner", "mission-control-app[bot]"],
    env: { ...appEnv, MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH: "relative.pem",
      MISSION_CONTROL_GITHUB_APP_BOT_LOGIN: "mission-control-app[bot]" } }), /must be absolute/);
  assert.throws(() => githubDecisionCopyTokenProviderFromEnv({ ...base, authorizedWriterLogins: ["owner"],
    env: { ...appEnv, MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN: "static-token" } }), /not both/);

  // A static token keeps enabling copying, as before.
  const staticCopy = githubDecisionCopyTokenProviderFromEnv({ ...base, authorizedWriterLogins: ["owner"],
    env: { MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN: "static-token" } });
  assert.equal(staticCopy.disabledReason, null);
  assert.equal(await staticCopy.provider?.(), "static-token");
});

test("the daemon builds its decision-copy credentials only through the soft-off helper", () => {
  const server = readFileSync("daemon/server.ts", "utf8");
  assert.match(server, /githubDecisionCopyTokenProviderFromEnv\(\{ repository: githubPolicy\.repository,/);
  assert.match(server, /event: "github_decision_copying_off"/);
  assert.doesNotMatch(server, /issuesPermission: "write"/);
});

test("private reconciliation obtains one provider token and sends it on every configured issue read", async () => {
  const store = new EventStore(":memory:");
  const authorizationHeaders: Array<string | null> = [];
  let tokenCalls = 0;
  try {
    const appended = await reconcileGitHubDecisionReceipts(store, {
      policy: policy(),
      tokenProvider: async () => { tokenCalls += 1; return "installation-token"; },
      fetchImpl: async (_input, init) => {
        authorizationHeaders.push(new Headers(init?.headers).get("authorization"));
        return Response.json([]);
      },
    });
    assert.deepEqual(appended, []);
    assert.equal(tokenCalls, 1);
    assert.deepEqual(authorizationHeaders, [
      "Bearer installation-token",
      "Bearer installation-token",
      "Bearer installation-token",
    ]);
  } finally {
    store.close();
  }
});

function policy(): GitHubReceiptPolicy {
  return {
    repository: "owner/private-receipts",
    decisionIssueNumber: 4,
    capabilityIssueNumber: 5,
    stageIssueNumber: 6,
    authorizedWriterLogins: ["owner"],
    capabilityChallenges: [],
  };
}
