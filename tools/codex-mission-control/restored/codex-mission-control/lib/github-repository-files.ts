// Reads one file of a GitHub repository at an exact commit, for checking a task's checkpoint (lib/task-checkpoint.ts).
import type { GitHubReconciliationTokenProvider } from "./github-app-auth";
import { TaskCheckpointReadError, TaskCheckpointRejectedError, type RepositoryFileReader } from "./task-checkpoint";

const githubApiVersion = "2022-11-28";

/** A reader over GitHub's contents API with the raw media type (files up to 100 MB), bounded in size and time. */
export function githubRepositoryFileReader(tokenProvider: GitHubReconciliationTokenProvider,
  fetchImpl: typeof fetch = fetch): RepositoryFileReader {
  return async (repository, path, commit, maxBytes) => {
    const token = await tokenProvider();
    if (!token) throw new TaskCheckpointReadError("No GitHub reader is configured for the checkpoint repository.");
    const [owner, name] = repository.split("/");
    const url = `https://api.github.com/repos/${encodeURIComponent(owner!)}/${encodeURIComponent(name!)}/contents/`
      + `${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(commit)}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        headers: {
          accept: "application/vnd.github.raw+json",
          authorization: `Bearer ${token}`,
          "user-agent": "mission-control-task-checkpoint",
          "x-github-api-version": githubApiVersion,
        },
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new TaskCheckpointReadError(`GitHub could not be reached to read ${path}.`);
    }
    if (response.status === 404) {
      throw new TaskCheckpointRejectedError(`${path} is not in ${repository} at commit ${commit.slice(0, 12)}, or Mission Control can't read that repository.`);
    }
    if (!response.ok) throw new TaskCheckpointReadError(`GitHub answered HTTP ${response.status} for ${path}.`);
    const declared = Number(response.headers.get("content-length") ?? NaN);
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new TaskCheckpointRejectedError(`${path} is larger than Mission Control reads for a checkpoint.`);
    }
    if (!response.body) return new Uint8Array(0);
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new TaskCheckpointRejectedError(`${path} is larger than Mission Control reads for a checkpoint.`);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  };
}
