// Start explicitly with: node --import tsx scripts/run-capability-nonce-broker.mjs
// MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE=%d/github-token comes from systemd:
// LoadCredential=github-token:/etc/mission-control/capability-nonce-publisher/github-token
// Provision NON-ROOT mc-nonce-publisher, primary group 1000 (joel), isolated service,
// RuntimeDirectory=mission-control-capability-publisher/broker, RuntimeDirectoryMode=0750.
// The parent /run/mission-control-capability-publisher is stable and ROOT-owned;
// only the broker child is systemd runtime-managed/replaced during restarts.
// The owner supplies a one-repository fine-grained PAT with only Issues:write;
// the broker, not GitHub's PAT model, narrows writes to #60 nonce creation.
// Never mount the credential into the daemon/relay or use a workstation gh token.
import { createServer } from "node:http";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as publisherModule from "../lib/capability-nonce-publisher.ts";
const {
  FixedBusCapabilityNoncePublisher, capabilityNonceBrokerPath, capabilityNonceBrokerMaxBytes,
  dispatchCapabilityNonceBrokerRequest, capabilityNonceErrorCode,
} = publisherModule.default ?? publisherModule; // tsx respects this package's CJS TS mode.

const unavailable = () => { throw new Error("CAPABILITY_PUBLISHER_UNAVAILABLE"); };
export const brokerSocketPath = "/run/mission-control-capability-publisher/broker/publisher.sock";
export const brokerCredentialDirectory = "/run/credentials/mission-control-capability-nonce-publisher.service";
export function parseBrokerArguments(argv, env = process.env) {
  if (argv.length !== 0 && !(argv.length === 2 && argv[0] === "--socket" && argv[1] === brokerSocketPath)) unavailable();
  const credentialFile = env.MISSION_CONTROL_CAPABILITY_GITHUB_TOKEN_FILE;
  if (env.CREDENTIALS_DIRECTORY!==brokerCredentialDirectory || credentialFile!==`${brokerCredentialDirectory}/github-token`) unavailable();
  return { socket: brokerSocketPath, credentialFile };
}

/** Require effective kernel/process settings, not merely service-file declarations. */
export async function verifyBrokerDumpProtection(io = fs) {
  const limits = await io.readFile("/proc/self/limits", "utf8");
  if (typeof limits !== "string" || Buffer.byteLength(limits) > 8192) unavailable();
  const coreLimits = [...limits.matchAll(/^Max core file size[ \t]+(\S+)[ \t]+(\S+)[ \t]+bytes[ \t]*$/gm)];
  if (coreLimits.length !== 1 || coreLimits[0][1] !== "0" || coreLimits[0][2] !== "0") unavailable();
  const filter = await io.readFile("/proc/self/coredump_filter", "utf8");
  if (typeof filter !== "string" || !/^00000000\n?$/.test(filter)) unavailable();
  const rawPattern = await io.readFile("/proc/sys/kernel/core_pattern", "utf8");
  if (typeof rawPattern !== "string" || Buffer.byteLength(rawPattern) > 129) unavailable();
  const pattern = rawPattern.endsWith("\n") ? rawPattern.slice(0, -1) : rawPattern;
  // A pipe handler can bypass RLIMIT_CORE. Admit only a bounded local filename:
  // no pipe, absolute/relative directory path, substitutions, arguments or spaces.
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(pattern)) unavailable();
}

/** No symlinks, other-user writable ancestors, or broad readable credentials. */
export async function readProtectedBrokerCredential(path, io = fs, uid = process.geteuid?.(), env = process.env) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || !path.startsWith("/") || resolve(path) !== path || path.includes("\0")) unavailable();
  await verifyBrokerDumpProtection(io); // Must succeed before even stat/open of the PAT.
  await protectAncestors(dirname(path), io, uid);
  const before = await io.lstat(path);
  let protectedIdentity=before.uid===uid && [0o400,0o600].includes(before.mode&0o7777);
  if(before.uid===0 && before.gid===0 && (before.mode&0o7777)===0o440) {
    // PID1's service-private LoadCredential mount uses root ownership with an ACL
    // for the dynamic service UID. This is NOT a generic group-readable-file exception.
    if(env.CREDENTIALS_DIRECTORY!==brokerCredentialDirectory || path!==`${brokerCredentialDirectory}/github-token`) unavailable();
    const directory=await io.lstat(brokerCredentialDirectory);
    if(!directory.isDirectory() || directory.isSymbolicLink() || directory.uid!==0 || directory.gid!==0 || (directory.mode&0o7777)!==0o550) unavailable();
    const mountinfo=await io.readFile("/proc/self/mountinfo","utf8");
    if(typeof mountinfo!=="string" || Buffer.byteLength(mountinfo)>1_048_576) unavailable();
    const mounts=mountinfo.split("\n").map(line=>line.split(" ")).filter(fields=>fields[4]===brokerCredentialDirectory);
    if(mounts.length!==1) unavailable();
    const mount=mounts[0],separator=mount.indexOf("-");
    if(separator<6 || !mount[5].split(",").includes("ro") || mount[5].split(",").includes("rw") || !["ramfs","tmpfs"].includes(mount[separator+1])) unavailable();
    // tmpfs does not by itself prove non-swappability; no such claim is made here.
    protectedIdentity=true;
  }
  if (!before.isFile() || before.isSymbolicLink() || !protectedIdentity
    || before.size < 31 || before.size > 300 || before.nlink !== 1) unavailable();
  const handle = await io.open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const checked = await handle.stat();
    if (!checked.isFile() || checked.dev !== before.dev || checked.ino !== before.ino || checked.mode !== before.mode
      || checked.uid !== before.uid || checked.gid !== before.gid || checked.size !== before.size || checked.nlink !== 1) unavailable();
    const buffer = Buffer.alloc(301);
    try {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
      if (bytesRead !== before.size) unavailable();
      const raw = buffer.subarray(0, bytesRead).toString("utf8");
      if (!/^github_pat_[A-Za-z0-9_]{20,255}\n?$/.test(raw)) unavailable();
      return raw.replace(/\n$/, ""); // Never returned over the socket or written to logs.
    } finally { buffer.fill(0); }
  } finally { await handle.close(); }
}
async function protectAncestors(path, io, uid) {
  for (let current = path;; current = dirname(current)) {
    const entry = await io.lstat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink() || ![0, uid].includes(entry.uid) || (entry.mode & 0o022)) unavailable();
    if (current === "/") return;
  }
}

export async function validateBrokerRuntimeDirectory(socket, io = fs, uid = process.geteuid?.(), gid = process.getegid?.()) {
  if (!Number.isSafeInteger(uid) || uid <= 0 || gid !== 1000 || socket !== brokerSocketPath) unavailable();
  await protectAncestors(dirname(socket), io, uid);
  const stableParent = await io.lstat(dirname(dirname(socket)));
  if (stableParent.uid !== 0) unavailable();
  const directory = await io.lstat(dirname(socket));
  if (directory.uid !== uid || directory.gid !== 1000 || (directory.mode & 0o7777) !== 0o750) unavailable();
}

export async function startCapabilityNonceBroker(options) {
  const uid = process.geteuid?.();
  await validateBrokerRuntimeDirectory(options.socket, fs, uid);
  // Node has no public prctl(PR_SET_DUMPABLE) binding. Dump prevention must be
  // enforced by the service/launcher and host core policy, not a guessed syscall.
  // Disable Node's separate diagnostic-report paths before loading any credential.
  if (process.report) {
    process.report.reportOnFatalError = false;
    process.report.reportOnSignal = false;
    process.report.reportOnUncaughtException = false;
  }
  // Never unlink a pre-existing socket: ambiguous/live ownership is an operator boundary.
  try { await fs.lstat(options.socket); unavailable(); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const publisher = new FixedBusCapabilityNoncePublisher(await readProtectedBrokerCredential(options.credentialFile));
  await publisher.verifyWriter();
  process.umask(0o117); // Socket 0660 from creation; no transient world access.
  const server = createServer({ maxHeaderSize: 8192 }, (request, response) => {
    const reply = (payload) => {
      if (response.destroyed || response.writableEnded) return;
      response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", connection: "close" });
      response.end(JSON.stringify(payload));
    };
    if (request.method !== "POST" || request.url !== capabilityNonceBrokerPath || request.headers["content-type"] !== "application/json"
      || request.headers["content-encoding"] || request.headers["transfer-encoding"] || !/^\d+$/.test(request.headers["content-length"] ?? "")
      || Number(request.headers["content-length"]) > capabilityNonceBrokerMaxBytes) {
      reply({ ok: false, error: "CAPABILITY_PUBLISHER_INVALID_REQUEST" }); request.resume(); return;
    }
    let size = 0; const chunks = [];
    request.on("error", () => reply({ ok: false, error: "CAPABILITY_PUBLISHER_INVALID_REQUEST" }));
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > capabilityNonceBrokerMaxBytes) { reply({ ok: false, error: "CAPABILITY_PUBLISHER_INVALID_REQUEST" }); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on("end", async () => {
      if (size > capabilityNonceBrokerMaxBytes || size !== Number(request.headers["content-length"])) return;
      try {
        const proof = await dispatchCapabilityNonceBrokerRequest(JSON.parse(Buffer.concat(chunks).toString("utf8")), publisher);
        reply({ ok: true, proof });
      } catch (error) { reply({ ok: false, error: capabilityNonceErrorCode(error) }); }
    });
  });
  server.headersTimeout = 5000; server.requestTimeout = 10_000;
  server.keepAliveTimeout = 1000; server.maxRequestsPerSocket = 1; server.maxHeadersCount = 16;
  server.on("clientError", (_error, socket) => socket.destroy());
  await new Promise((ready, reject) => { server.once("error", reject); server.listen(options.socket, ready); });
  try {
    await fs.chmod(options.socket, 0o660);
    const identity = await fs.lstat(options.socket);
    if (!identity.isSocket() || identity.uid !== uid || identity.gid !== 1000 || (identity.mode & 0o7777) !== 0o660) unavailable();
    return server;
  } catch {
    server.close(); server.closeAllConnections(); unavailable();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const server = await startCapabilityNonceBroker(parseBrokerArguments(process.argv.slice(2)));
    const stop = () => { server.close(); server.closeIdleConnections(); };
    process.once("SIGTERM", stop); process.once("SIGINT", stop);
    // No credential, request, response, fixture or error-object logging.
  } catch { process.stderr.write("CAPABILITY_PUBLISHER_UNAVAILABLE\n"); process.exitCode = 1; }
}
