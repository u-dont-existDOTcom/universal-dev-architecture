# Active email-lane reply and delivery continuity

**Status:** Current universal instruction, originating from the owner's explicit request of 2026-10-30: any work lane sending emails also checks replies on each turn. This pattern governs workflows with authorized outbound correspondence: research, procurement, support, hiring, data access, operational requests and other tasks.

## Trigger and timing

When a work lane has sent at least one task-related email with an unresolved reply, document, decision, delivery or follow-up dependency, run **a live inbound check on every subsequent turn where that lane works or resumes**, before substantive new work. "Continue," a new model/chat, a detour to a different subtask in the same lane, or a prior scheduled watch do not waive the check. Restore the ledger after compaction or handoff.

This is **lane-scoped**, not authority to search unrelated private inboxes during unrelated work. It does not imply checks occur between turns: only a separately installed, verified automation or worker may do background monitoring.

## Operational contract

1. **Recover complete correspondence scope.** From the lane's authoritative private checkpoint enumerate outstanding threads, exact sent-message/thread IDs, recipients, meaningful subject, last sent/checked timestamps, relevant aliases, next needed evidence and response status. Do not restrict the scan to the most recent email. Immediately register every new authorized outbound request.
2. **Check the connected actual mailbox now.** Prefer exact threads and sender identities; use a bounded, scoped date/subject search for broken threads, aliases and incoming mail not filed under the original thread. Check replies and attachments **and** bounces, delivery-status notices, refusals, automated acknowledgments, auto-forwards and material transport failures. Sent-folder presence, a draft, a cached prior watch, a search snippet, `is:unread` alone or claimed delivery are not an adequate check. Read the full body of relevant new messages before classifying.
3. **Reconcile every outstanding item:** `MATERIAL_REPLY`, `BOUNCED`, `AUTO_ACK`, `NO_NEW_REPLY_VERIFIED`, `AMBIGUOUS_MATCH`, `ACCESS_BLOCKED` or `CLOSED`, with grounded message IDs and UTC check time in the authorized private ledger. A bounce is **not** a pending reply: confirm the failure and look for an independently verified replacement contact if still in scope. The check is complete only if all open threads were covered, or it reports precise missed-thread/access boundaries. Do not infer rejection from silence.
4. **Act on substantive new facts now.** Read the requested attachments, update research/supplier/task conclusions, send a necessary authorized reply or appropriately bounded alternate-contact query, or record the exact dependency. Recheck the Sent thread immediately before any follow-up to avoid duplicate or irrelevant messages. Permission to check does **not** grant permission for new unrelated sending, public disclosure, paid transactions, or bypassing an unsubscribe.
5. **Preserve evidence and privacy.** Keep addresses, private bodies, attachment content, participant identities and exact thread links only in an owner-authorized private correspondence store. In portable/public project artifacts record only generalized statuses and deidentified work impact. Link a genuine new reply to its exact source in the private ledger; do not turn unanswered mail into evidence.
6. **Carry an active-turn receipt** at checkpoint/final delivery: lane, threads in scope and actually searched, query coverage, newly classified replies and bounces, action taken, checked time, next dependencies and exact blockers. No new mail must mean a real successful query; otherwise say `ACCESS_BLOCKED`. A batch query may cover multiple lanes when every open thread is reconciled individually.

## Scheduling and closures

A daily/weekly watcher may complement but **never substitute** for the live per-turn check without a verified current-turn thread-specific receipt. Its existence is not proof it ran. When a lane closes and no correspondence dependencies remain, stop its per-turn scans. If a task sends an email and does not retain the thread in its recovery record, it is not complete.

## Regression cases

- **Pass:** On a resumed three-thread clinical-study lane, check all sent threads and delivery notifications; classify one answered, one 550 delivery failure, one unanswered; read the response and pursue a verified alternative address for the bounce. Preserve statuses separately and move research forward.
- **Fail:** Only `is:unread` is searched; a read reply or bounce is missed. A scheduled watcher ran yesterday and the active lane skips the mailbox. Only the newest outgoing thread is queried. An unanswered Sent email is reported as delivered.
- **Access boundary:** Mail connector unavailable; record the exact inaccessible scope and continue safe independent work. Never claim monitoring occurred or is ongoing.

**Installation vs execution:** An indexed source and passing tests prove instructions were committed, not that every runtime invoked them. Application requires a current-turn mailbox-read receipt. A project may add tighter privacy/consent, spending or recipient rules without weakening these checks.
