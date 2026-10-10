import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";

const githubApiVersion = "2022-11-28";
const refreshSkewMs = 5 * 60_000;

export type GitHubReconciliationTokenProvider = () => Promise<string | undefined>;

/** The App's own `[bot]` login is not configured, or the receipt policy does not trust it as a writer. */
export class GitHubAppBotWriterNotAuthorizedError extends Error {
  constructor() {
    super("GitHub App copying requires MISSION_CONTROL_GITHUB_APP_BOT_LOGIN in receipt-policy authorizedWriterLogins.");
    this.name = "GitHubAppBotWriterNotAuthorizedError";
  }
}

export interface GitHubAppInstallationTokenProviderOptions {
  appId: string;
  installationId: string;
  privateKeyPem: string;
  repository: string;
  issuesPermission?: 'read' | 'write';
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export class GitHubAppInstallationTokenProvider {
  private readonly appId: string;
  private readonly installationId: string;
  private readonly repositoryName: string;
  private readonly privateKey: ReturnType<typeof createPrivateKey>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly issuesPermission: 'read' | 'write';
  private cached: { token: string; expiresAtMs: number } | null = null;

  constructor(options: GitHubAppInstallationTokenProviderOptions) {
    this.appId = positiveIntegerString(options.appId, "GitHub App ID");
    this.installationId = positiveIntegerString(options.installationId, "GitHub App installation ID");
    this.repositoryName = repositoryName(options.repository);
    this.privateKey = createPrivateKey(options.privateKeyPem);
    if (this.privateKey.asymmetricKeyType !== "rsa") throw new Error("GitHub App private key must be an RSA key.");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.issuesPermission = options.issuesPermission ?? 'read';
  }

  async token(): Promise<string> {
    const nowMs = this.now();
    if (this.cached && nowMs < this.cached.expiresAtMs - refreshSkewMs) return this.cached.token;

    const jwt = this.appJwt(nowMs);
    const response = await this.fetchImpl(
      `https://api.github.com/app/installations/${this.installationId}/access_tokens`,
      {
        method: "POST",
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
          "user-agent": "mission-control-supervision-reconciler",
          "x-github-api-version": githubApiVersion,
        },
        body: JSON.stringify({
          repositories: [this.repositoryName],
          permissions: { issues: this.issuesPermission },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) throw new Error(`GitHub App installation-token request failed with HTTP ${response.status}.`);
    const payload = await response.json() as unknown;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("GitHub App installation-token response was not an object.");
    }
    const token = (payload as Record<string, unknown>).token;
    const expiresAt = (payload as Record<string, unknown>).expires_at;
    const expiresAtMs = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
    if (typeof token !== "string" || token.trim().length === 0 || !Number.isFinite(expiresAtMs)) {
      throw new Error("GitHub App installation-token response omitted a valid token or expiry.");
    }
    if (expiresAtMs <= nowMs + refreshSkewMs) {
      throw new Error("GitHub App installation token expires too soon for safe reconciliation.");
    }
    this.cached = { token, expiresAtMs };
    return token;
  }

  private appJwt(nowMs: number): string {
    const issuedAt = Math.floor(nowMs / 1000) - 60;
    const header = base64url({ alg: "RS256", typ: "JWT" });
    const payload = base64url({ iat: issuedAt, exp: issuedAt + 9 * 60, iss: this.appId });
    const unsigned = `${header}.${payload}`;
    const signature = sign("RSA-SHA256", Buffer.from(unsigned, "utf8"), this.privateKey).toString("base64url");
    return `${unsigned}.${signature}`;
  }
}

export function githubReconciliationTokenProviderFromEnv(options: {
  repository: string;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  readFile?: (path: string) => string;
  issuesPermission?: 'read' | 'write';
  authorizedWriterLogins?: readonly string[];
}): GitHubReconciliationTokenProvider | null {
  const env = options.env ?? process.env;
  const staticToken = env.MISSION_CONTROL_GITHUB_RECONCILIATION_TOKEN?.trim();
  const appId = env.MISSION_CONTROL_GITHUB_APP_ID?.trim();
  const installationId = env.MISSION_CONTROL_GITHUB_APP_INSTALLATION_ID?.trim();
  const privateKeyPath = env.MISSION_CONTROL_GITHUB_APP_PRIVATE_KEY_PATH?.trim();
  const appValues = [appId, installationId, privateKeyPath];
  const configuredAppValues = appValues.filter(Boolean).length;

  if (staticToken && configuredAppValues > 0) {
    throw new Error("Configure either a static GitHub reconciliation token or GitHub App authentication, not both.");
  }
  if (configuredAppValues > 0 && configuredAppValues !== appValues.length) {
    throw new Error("GitHub App reconciliation requires App ID, installation ID, and private-key path together.");
  }
  if (configuredAppValues === appValues.length) {
    if (options.issuesPermission === 'write') {
      const botLogin = env.MISSION_CONTROL_GITHUB_APP_BOT_LOGIN?.trim();
      if (!botLogin || !/^[A-Za-z0-9-]+\[bot\]$/.test(botLogin)
        || !options.authorizedWriterLogins?.includes(botLogin)) {
        throw new GitHubAppBotWriterNotAuthorizedError();
      }
    }
    if (!isAbsolute(privateKeyPath!)) throw new Error("GitHub App private-key path must be absolute.");
    const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
    const provider = new GitHubAppInstallationTokenProvider({
      appId: appId!,
      installationId: installationId!,
      privateKeyPem: readFile(privateKeyPath!),
      repository: options.repository,
      fetchImpl: options.fetchImpl,
      now: options.now,
      issuesPermission: options.issuesPermission,
    });
    return () => provider.token();
  }
  return staticToken ? async () => staticToken : null;
}

/**
 * Write-capable token provider for request-bound decision copying. When the App's bot writer is not configured
 * and trusted by the receipt policy, copying stays off (null provider with the reason) instead of stopping the
 * daemon: no comment can be published under an untrusted author either way, and everything else keeps running.
 * Every other configuration error still throws, exactly as for read-only reconciliation.
 */
export function githubDecisionCopyTokenProviderFromEnv(
  options: Omit<Parameters<typeof githubReconciliationTokenProviderFromEnv>[0], "issuesPermission">,
): { provider: GitHubReconciliationTokenProvider | null; disabledReason: string | null } {
  try {
    return { provider: githubReconciliationTokenProviderFromEnv({ ...options, issuesPermission: "write" }), disabledReason: null };
  } catch (error) {
    if (!(error instanceof GitHubAppBotWriterNotAuthorizedError)) throw error;
    return { provider: null, disabledReason: error.message };
  }
}

function base64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function positiveIntegerString(value: string, label: string): string {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function repositoryName(repository: string): string {
  const match = repository.match(/^[A-Za-z0-9_.-]+\/([A-Za-z0-9_.-]+)$/);
  if (!match) throw new Error("GitHub App token repository must be an owner/name identifier.");
  return match[1]!;
}
