"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

interface ConfiguredChat { scope: string; workerId: string | null; url: string; label: string }

// The owner's configured supervisor chats, read once per page load and shared by every button on the page.
let configuredChats: Promise<ConfiguredChat[]> | null = null;
function loadConfiguredChats(): Promise<ConfiguredChat[]> {
  configuredChats ??= fetch("/api/supervisor-directory", { cache: "no-store" })
    .then((response) => (response.ok ? response.json() : null))
    .then((body) => (Array.isArray(body?.entries) ? body.entries as ConfiguredChat[] : []))
    .catch(() => []);
  return configuredChats;
}

/**
 * The worker's supervisor chat: the route or link recorded for the worker, else the specialist chat the owner
 * configured for it (the same directory the supervision page uses), else a plain "No supervisor chat linked" with a
 * pointer to the supervision page. Never a placeholder address or the ChatGPT home page.
 */
export function SupervisorLink({ url, label, placeholder, workerId }: { url: string; label: string; placeholder: boolean; workerId?: string }) {
  const recorded = !placeholder && url.startsWith("https://") ? url : null;
  const [configured, setConfigured] = useState<ConfiguredChat | null>(null);
  useEffect(() => {
    if (recorded || !workerId) return;
    let current = true;
    void loadConfiguredChats().then((entries) => {
      const entry = entries.find((candidate) => candidate.scope === "SPECIALIST" && candidate.workerId === workerId
        && typeof candidate.url === "string" && candidate.url.startsWith("https://"));
      if (current) setConfigured(entry ?? null);
    });
    return () => { current = false; };
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
