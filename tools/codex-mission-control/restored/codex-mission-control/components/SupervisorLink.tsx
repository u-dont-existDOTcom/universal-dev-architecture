"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isSpecificChatAddress } from "@/lib/supervisor-chat-address";

export interface ConfiguredChat { scope: string; workerId: string | null; url: string; label: string }

const DIRECTORY_FRESH_MS = 60_000;
const DIRECTORY_RETRY_MS = 15_000;

// The owner's configured supervisor chats, shared by every button on the page: one request at a time, a successful
// answer reused for a minute, and a failed one never remembered. Each button looks again after a minute (15 seconds
// after a failure), so it recovers once the directory answers and shows a chat configured later.
let directory: { entries: ConfiguredChat[]; at: number } | null = null;
let pending: Promise<ConfiguredChat[] | null> | null = null;
export function loadConfiguredChats(now: () => number = Date.now): Promise<ConfiguredChat[] | null> {
  if (directory && now() - directory.at < DIRECTORY_FRESH_MS) return Promise.resolve(directory.entries);
  pending ??= fetch("/api/supervisor-directory", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => {
      if (!body || !Array.isArray(body.entries)) return null;
      directory = { entries: body.entries as ConfiguredChat[], at: now() };
      return directory.entries;
    })
    .catch(() => null)
    .finally(() => { pending = null; });
  return pending;
}
export function forgetConfiguredChats() { directory = null; pending = null; }
/** When to look again: soon after a failed read, otherwise once the shared answer is old, so a chat the owner
 * configures later appears without reloading the page. */
export function nextDirectoryLookupMs(entries: ConfiguredChat[] | null): number {
  return entries === null ? DIRECTORY_RETRY_MS : DIRECTORY_FRESH_MS;
}

/**
 * The worker's supervisor chat: the route or link recorded for the worker when it names one specific chat, else the
 * specialist chat the owner configured for it (the same directory the supervision page uses), else a plain "No
 * supervisor chat linked" with a pointer to the supervision page. Never a placeholder address or a site's home page.
 */
export function SupervisorLink({ url, label, placeholder, workerId }: { url: string; label: string; placeholder: boolean; workerId?: string }) {
  const recorded = !placeholder && isSpecificChatAddress(url) ? url : null;
  const [configured, setConfigured] = useState<ConfiguredChat | null>(null);
  useEffect(() => {
    if (recorded || !workerId) return;
    let current = true;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const look = () => void loadConfiguredChats().then((entries) => {
      if (!current) return;
      if (entries !== null) {
        setConfigured(entries.find((candidate) => candidate.scope === "SPECIALIST" && candidate.workerId === workerId
          && isSpecificChatAddress(candidate.url)) ?? null);
      }
      retry = setTimeout(look, nextDirectoryLookupMs(entries));
    });
    look();
    return () => { current = false; if (retry) clearTimeout(retry); };
  }, [recorded, workerId]);

  const href = recorded ?? configured?.url ?? null;
  if (!href) {
    return (
      <div className="supervisor-link-wrap">
        <span className="supervisor-link supervisor-link-missing" title="No supervisor chat is recorded or configured for this worker yet">
          <span className="chat-glyph" aria-hidden="true">◫</span>
          <span>No supervisor chat linked</span>
        </span>
        <Link className="supervisor-link-hint" href="/supervision">Supervision chats →</Link>
      </div>
    );
  }
  return (
    <div className="supervisor-link-wrap">
      <a className="supervisor-link" href={href} target="_blank" rel="noreferrer">
        <span className="chat-glyph" aria-hidden="true">◫</span>
        <span>{recorded ? label : configured?.label ?? label}</span>
        <span aria-hidden="true">↗</span>
      </a>
    </div>
  );
}
