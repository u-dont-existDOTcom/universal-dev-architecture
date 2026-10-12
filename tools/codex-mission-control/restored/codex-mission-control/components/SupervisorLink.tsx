"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSpecificChatAddress } from "@/lib/supervisor-chat-address";

export interface ConfiguredChat { scope: string; workerId: string | null; url: string; label: string }

const DIRECTORY_FRESH_MS = 60_000;
const DIRECTORY_RETRY_MS = 15_000;
const DIRECTORY_TIMEOUT_MS = 10_000;
const DIRECTORY_MIN_GAP_MS = 1_000;
const ANSWERED_STATES = new Set(["CONFIGURED", "MISSING"]);

// The owner's configured supervisor chats, shared by every button on the page: one request at a time, a successful
// answer reused for a minute, and a failed one never remembered. A request that hasn't answered after ten seconds, an
// error status, a malformed answer and a list the server reports as invalid all count as failed. Each button looks
// again when the shared answer expires (15 seconds after a failure), so it recovers once the directory answers and
// shows a chat configured later.
let directory: { entries: ConfiguredChat[]; at: number } | null = null;
let pending: Promise<ConfiguredChat[] | null> | null = null;
export function loadConfiguredChats(now: () => number = Date.now, timeoutMs = DIRECTORY_TIMEOUT_MS): Promise<ConfiguredChat[] | null> {
  if (directory && now() - directory.at < DIRECTORY_FRESH_MS) return Promise.resolve(directory.entries);
  if (pending) return pending;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const request: Promise<ConfiguredChat[] | null> = fetch("/api/supervisor-directory", { cache: "no-store", signal: abort.signal })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => {
      // Only a configured or a not-configured list is an answer. An invalid one comes back with no entries, which would
      // read as "no chat": it is a failed read, and it never replaces a good answer.
      if (!body || !ANSWERED_STATES.has(body.configurationState) || !Array.isArray(body.entries)
        || !body.entries.every(isConfiguredChat)) return null;
      directory = { entries: body.entries as ConfiguredChat[], at: now() };
      return directory.entries;
    })
    .catch(() => null)
    .finally(() => {
      clearTimeout(timer);
      if (pending === request) pending = null;
    });
  pending = request;
  return request;
}
export function forgetConfiguredChats() { directory = null; pending = null; }
/** When to look again: soon after a failed read; otherwise when the shared answer expires, not a full minute after
 * this button's own read of it, so every button on the page refreshes together and a chat the owner configures later
 * appears without reloading the page. */
export function nextDirectoryLookupMs(entries: ConfiguredChat[] | null, now: () => number = Date.now): number {
  if (entries === null) return DIRECTORY_RETRY_MS;
  if (!directory || directory.entries !== entries) return DIRECTORY_FRESH_MS;
  return Math.max(DIRECTORY_MIN_GAP_MS, directory.at + DIRECTORY_FRESH_MS - now());
}

function isConfiguredChat(value: unknown): value is ConfiguredChat {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.scope === "string" && (entry.workerId === null || typeof entry.workerId === "string")
    && typeof entry.url === "string" && typeof entry.label === "string";
}

/** What a button knows about its worker's configured chat: nothing yet, that the directory can't be read right now,
 * or the directory's answer (the worker's chat, or none) and when it got it. */
export type DirectoryAnswer =
  | { state: "checking" }
  | { state: "unavailable"; workerId: string }
  | { state: "known"; workerId: string; chat: ConfiguredChat | null; at: number };

const LAST_ANSWER_KEPT_MS = 5 * 60_000;

/** The answer after a lookup. A read directory gives the worker's own specialist chat, or none. A failed read keeps
 * the last answer for the same worker for up to five minutes; after that, or without one, the directory is
 * unavailable, which is not the same as no chat. */
export function afterLookup(previous: DirectoryAnswer, workerId: string, entries: ConfiguredChat[] | null, now: number = Date.now()): DirectoryAnswer {
  if (entries === null) {
    const recent = previous.state === "known" && previous.workerId === workerId && now - previous.at < LAST_ANSWER_KEPT_MS;
    return recent ? previous : { state: "unavailable", workerId };
  }
  const chat = entries.find((candidate) => candidate.scope === "SPECIALIST" && candidate.workerId === workerId
    && isSpecificChatAddress(candidate.url)) ?? null;
  return { state: "known", workerId, chat, at: now };
}

export interface SupervisorLinkProps {
  url: string; label: string; placeholder: boolean; workerId?: string;
  /** The ChatGPT conversation of the task's latest supervisor question, when the relay recorded one. */
  activityUrl?: string | null;
}
export const LATEST_CHAT_LABEL = "Open its latest supervisor chat";
export type SupervisorChatView =
  | { kind: "link"; href: string; label: string }
  | { kind: "none" }
  | { kind: "checking" }
  | { kind: "unavailable" };

/** What the button shows: the chat of the task's latest supervisor question (where the supervising actually happened),
 * else the recorded chat when it names one specific chat, else the configured one once the directory has answered for
 * this worker. "No supervisor chat yet" only when that answer, or the lack of a worker to look up, says so; while
 * the directory is unanswered or unreadable, it says that instead. */
export function supervisorChatView({ url, label, placeholder, workerId, activityUrl }: SupervisorLinkProps, answer: DirectoryAnswer): SupervisorChatView {
  if (activityUrl && isSpecificChatAddress(activityUrl)) return { kind: "link", href: activityUrl, label: LATEST_CHAT_LABEL };
  if (!placeholder && isSpecificChatAddress(url)) return { kind: "link", href: url, label };
  if (!workerId) return { kind: "none" };
  if (answer.state === "checking" || answer.workerId !== workerId) return { kind: "checking" };
  if (answer.state === "unavailable") return { kind: "unavailable" };
  return answer.chat ? { kind: "link", href: answer.chat.url, label: answer.chat.label || label } : { kind: "none" };
}

const NO_LINK_TEXT = {
  none: { text: "No supervisor chat yet", title: "Mission Control opens a fresh supervisor chat whenever it asks this task's supervisor something; none has reached ChatGPT yet, and no standing chat is recorded or configured" },
  checking: { text: "Checking for a supervisor chat…", title: "Looking up the supervisor chats configured on the supervision page" },
  unavailable: { text: "Couldn't check for a supervisor chat; trying again", title: "Mission Control couldn't read its list of configured supervisor chats; it tries again shortly" },
} as const;

/**
 * The worker's supervisor chat: the conversation of its latest supervisor question, else the route or link recorded
 * for the worker when it names one specific chat, else the specialist chat the owner configured for it (the same
 * directory the supervision page uses), else a plain "No supervisor chat yet" with a pointer to the supervision
 * page. Never a placeholder address or a site's home page.
 */
export function SupervisorLink(props: SupervisorLinkProps) {
  const { url, placeholder, workerId, activityUrl } = props;
  const recorded = Boolean(activityUrl && isSpecificChatAddress(activityUrl)) || (!placeholder && isSpecificChatAddress(url));
  const [answer, setAnswer] = useState<DirectoryAnswer>({ state: "checking" });
  useEffect(() => {
    if (recorded || !workerId) return;
    let current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const look = () => void loadConfiguredChats().then((entries) => {
      if (!current) return;
      setAnswer((previous) => afterLookup(previous, workerId, entries));
      retry = setTimeout(look, nextDirectoryLookupMs(entries));
    });
    look();
    return () => { current = false; if (retry) clearTimeout(retry); };
  }, [recorded, workerId]);
  return <SupervisorLinkView view={supervisorChatView(props, answer)} />;
}

export function SupervisorLinkView({ view }: { view: SupervisorChatView }) {
  if (view.kind === "link") {
    return (
      <div className="supervisor-link-wrap">
        <a className="supervisor-link" href={view.href} target="_blank" rel="noreferrer">
          <span className="chat-glyph" aria-hidden="true">◫</span>
          <span>{view.label}</span>
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    );
  }
  const { text, title } = NO_LINK_TEXT[view.kind];
  return (
    <div className="supervisor-link-wrap">
      <span className="supervisor-link supervisor-link-missing" title={title}>
        <span className="chat-glyph" aria-hidden="true">◫</span>
        <span>{text}</span>
      </span>
      <Link className="supervisor-link-hint" href="/supervision">Supervision chats →</Link>
    </div>
  );
}
