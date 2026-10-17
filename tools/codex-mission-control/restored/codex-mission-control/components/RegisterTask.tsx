"use client";

import { useState } from "react";
import { ownerMutationHeaders } from "@/lib/browser-auth";

// The owner's own words for a new task. Mission Control records them exactly as typed; the task's outcome and contract
// are copies of these answers, so nothing here should be written by anyone but the owner.
export function RegisterTask() {
  const [worker, setWorker] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [mayUse, setMayUse] = useState("");
  const [mustNever, setMustNever] = useState("");
  const [doneWhen, setDoneWhen] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<{ worker: string; contractId: string } | null>(null);

  async function submit() {
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/workers", {
        method: "POST",
        headers: ownerMutationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ worker: worker.trim(), name, goal, may_use: mayUse, must_never: mustNever, done_when: doneWhen }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string; worker?: string; contractId?: string };
      if (!response.ok || !result.worker || !result.contractId) throw new Error(result.error ?? "The task could not be registered.");
      setRegistered({ worker: result.worker, contractId: result.contractId });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The task could not be registered.");
    } finally {
      setSending(false);
    }
  }

  if (registered) {
    return (
      <main className="register-shell">
        <section className="register-panel">
          <p className="eyebrow">TASK REGISTERED</p>
          <h1>{name}</h1>
          <p>Mission Control recorded your words as this task&apos;s owner source, outcome and contract (<code>{registered.contractId}</code>).</p>
          <p><a href={`/worker/${encodeURIComponent(registered.worker)}`}>Open the task</a> · <a href="/">Back to the dashboard</a></p>
        </section>
      </main>
    );
  }

  return (
    <main className="register-shell">
      <section className="register-panel owner-composer">
        <p className="eyebrow">REGISTER A TASK</p>
        <h1>A new task, in your words</h1>
        <p>Only your signed-in session can do this. What you type becomes the task&apos;s goal and limits exactly as written. Put one item per line in the last three answers.</p>
        <label htmlFor="register-worker">Task id (lowercase, e.g. atlas-living-pilot)</label>
        <input id="register-worker" value={worker} onChange={(event) => setWorker(event.target.value)} maxLength={80} autoComplete="off" />
        <label htmlFor="register-name">Name</label>
        <input id="register-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoComplete="off" />
        <label htmlFor="register-goal">What should this task achieve?</label>
        <textarea id="register-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={4000} />
        <label htmlFor="register-may-use">What may it use?</label>
        <textarea id="register-may-use" value={mayUse} onChange={(event) => setMayUse(event.target.value)} maxLength={4000} />
        <label htmlFor="register-must-never">What must it never do?</label>
        <textarea id="register-must-never" value={mustNever} onChange={(event) => setMustNever(event.target.value)} maxLength={4000} />
        <label htmlFor="register-done-when">When is it done?</label>
        <textarea id="register-done-when" value={doneWhen} onChange={(event) => setDoneWhen(event.target.value)} maxLength={4000} />
        {error && <p className="composer-error">{error}</p>}
        <div>
          <span>Recorded exactly as typed</span>
          <button type="button" onClick={() => void submit()} disabled={sending || !worker.trim() || !name.trim() || !goal.trim() || !mayUse.trim() || !mustNever.trim() || !doneWhen.trim()}>
            {sending ? "Registering…" : "Register the task"}
          </button>
        </div>
      </section>
    </main>
  );
}
