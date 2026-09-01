"use client";

import type { StoredEvent } from "@/lib/schema";
import { formatMessageTimestamp } from "@/lib/message-time";

type ReasoningMessageEvent = Extract<StoredEvent["data"], { type: "reasoning_message_recorded" }>;
type ReasoningStoredEvent = StoredEvent & { data: ReasoningMessageEvent };

export function ReasoningTranscript({ timeline }: { timeline: StoredEvent[] }) {
  const messages = timeline
    .filter((event): event is ReasoningStoredEvent => event.data.type === "reasoning_message_recorded")
    .sort((left, right) => sourceTime(left).localeCompare(sourceTime(right)) || left.sequence - right.sequence);
  const lastVerified = [...messages].reverse().find((event) => event.data.provenance_status === "VERIFIED"
    && Boolean(event.data.sent_at_source));
  const transcriptState = lastVerified
    ? "VERIFIED MESSAGE-LEVEL SOURCE TIME"
    : messages.length
      ? "TRANSCRIPT PRESENT · SOURCE TIME UNVERIFIED"
      : "NO MESSAGE-LEVEL CHATGPT EVIDENCE";

  return <section className="reasoning-transcript" aria-label="Project Manager and supervisor transcript">
    <div className="channel-panel-head">
      <div><p className="eyebrow">PROJECT MANAGER / SUPERVISOR TRANSCRIPT</p><h3>{transcriptState}</h3></div>
      <span>{messages.length} messages</span>
    </div>
    {messages.length === 0 && <p className="empty-channel">A chat URL, chat label, last-review age, or Codex summary does not establish when a ChatGPT message was sent. Ingest provider-bound or owner-attested message evidence before treating the reasoning surface as current.</p>}
    <div className="reasoning-transcript-thread">
      {messages.map((event) => {
        const message = event.data;
        const sent = formatMessageTimestamp(message.sent_at_source ?? "");
        const received = formatMessageTimestamp(message.received_at_mission_control);
        const body = message.exact_visible_body;
        return <article key={message.message_id} className={`reasoning-message ${message.provenance_status.toLowerCase()}`}>
          <div className="reasoning-message-head">
            <strong>{message.surface_role.replaceAll("_", " ")} · {message.author_role}</strong>
            <span className={`provenance-badge ${message.provenance_status.toLowerCase()}`}>{message.provenance_status.replaceAll("_", " ")}</span>
          </div>
          <time
            dateTime={sent.utcIso ?? undefined}
            title={sent.utcIso ? `${sent.utcIso} · source UTC` : "SOURCE TIMESTAMP UNAVAILABLE"}
            data-timestamp-verified={sent.verified ? "true" : "false"}
            suppressHydrationWarning
          >Sent {sent.absolute} · {sent.relative}</time>
          <small title={received.utcIso ?? undefined} suppressHydrationWarning>Received by Mission Control {received.absolute} · {received.relative}</small>
          {body ? <p>{body}</p> : message.immutable_provider_locator
            ? <p><a href={message.immutable_provider_locator} target="_blank" rel="noreferrer">Open immutable provider message</a></p>
            : <p className="composer-error">MESSAGE BODY AND PROVIDER LOCATOR UNAVAILABLE</p>}
          <dl>
            <div><dt>Provider</dt><dd>{message.provider_surface.replaceAll("_", " ")}</dd></div>
            <div><dt>Model / mode</dt><dd>{message.model_mode}</dd></div>
            <div><dt>Account / workspace</dt><dd>{message.account_workspace}</dd></div>
            <div><dt>Body SHA-256</dt><dd><code>{message.body_sha256}</code></dd></div>
            <div><dt>Recorder</dt><dd>{event.producerKind}:{event.producerId}</dd></div>
          </dl>
          {message.decision_request_id && <div className="owner-decision-request">
            <strong>OWNER DECISION REQUEST · {message.decision_request_id}</strong>
            <p>Answer in the linked supervisory chat when available. Codex cannot choose or paraphrase the response.</p>
            {message.immutable_provider_locator && <a href={message.immutable_provider_locator} target="_blank" rel="noreferrer">Open exact supervisory message</a>}
          </div>}
          {message.limitations.length > 0 && <small>LIMITATIONS · {message.limitations.join(" · ")}</small>}
        </article>;
      })}
    </div>
  </section>;
}

function sourceTime(event: ReasoningStoredEvent): string {
  return event.data.sent_at_source ?? event.data.received_at_mission_control ?? event.occurredAt;
}
