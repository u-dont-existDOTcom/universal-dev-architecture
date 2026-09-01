"use client";

import type { StoredEvent } from "@/lib/schema";
import { formatMessageTimestamp } from "@/lib/message-time";
import {
  decisionRouteStates,
  latestVerifiedReasoningMessage,
  reasoningMessages,
  type DecisionRouteState,
} from "@/lib/reasoning-message-state";

export function ReasoningTranscript({ timeline }: { timeline: StoredEvent[] }) {
  const messages = reasoningMessages(timeline);
  const routes = decisionRouteStates(timeline);
  const lastVerified = latestVerifiedReasoningMessage(timeline);
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
    {lastVerified && <VerifiedMessageTime event={lastVerified} />}
    {messages.length === 0 && <p className="empty-channel">A chat URL, chat label, last-review age, or Codex summary does not establish when a ChatGPT message was sent. Ingest provider-bound or owner-attested message evidence before treating the reasoning surface as current.</p>}
    {routes.length > 0 && <div className="decision-route-list" aria-label="Owner decision routes">
      {routes.map((route) => <DecisionRoute key={route.decisionRequestId} route={route} />)}
    </div>}
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
            <div><dt>Message ID</dt><dd><code>{message.message_id}</code></dd></div>
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

function VerifiedMessageTime({ event }: { event: ReturnType<typeof latestVerifiedReasoningMessage> & {} }) {
  if (!event) return null;
  const sent = formatMessageTimestamp(event.data.sent_at_source ?? "");
  return <div className="verified-chat-time" role="status">
    <span className="field-label">LATEST VERIFIED CHATGPT MESSAGE</span>
    <time dateTime={sent.utcIso ?? undefined} title={sent.utcIso ?? undefined} suppressHydrationWarning>{sent.absolute} · {sent.relative}</time>
    <code>{event.data.surface_role} · {event.data.message_id}</code>
  </div>;
}

function DecisionRoute({ route }: { route: DecisionRouteState }) {
  const request = route.request.data;
  const statusCopy: Record<DecisionRouteState["status"], string> = {
    OWNER_RESPONSE_REQUIRED: "Joel must answer the exact supervisory question. Codex has no decision authority.",
    VERBATIM_FORWARD_REQUIRED: "Joel answered through the Project Manager Chat. The exact body hash must be forwarded to the supervisory thread without paraphrase.",
    SUPERVISOR_RESOLUTION_REQUIRED: "The supervisor has Joel’s exact answer and must issue a new source-bound decision before execution resumes.",
    RESOLVED: "The supervisor issued a source-bound response after Joel’s exact answer.",
    INVALID_BINDING: "The response chain is altered, unbound, or ambiguously attributed. Execution must remain stopped.",
  };
  return <article className={`decision-route ${route.status.toLowerCase()}`}>
    <div className="reasoning-message-head">
      <strong>{route.decisionRequestId}</strong>
      <span className={`provenance-badge ${route.status === "RESOLVED" ? "verified" : route.status === "INVALID_BINDING" ? "unverified" : "owner_attested"}`}>{route.status.replaceAll("_", " ")}</span>
    </div>
    <p>{statusCopy[route.status]}</p>
    <dl>
      <div><dt>Request message</dt><dd><code>{request.message_id}</code></dd></div>
      <div><dt>Request body hash</dt><dd><code>{request.body_sha256}</code></dd></div>
      {route.projectManagerResponse && <div><dt>PM owner response</dt><dd><code>{route.projectManagerResponse.data.message_id} · {route.projectManagerResponse.data.body_sha256}</code></dd></div>}
      {route.supervisorResponse && <div><dt>Supervisor-thread owner response</dt><dd><code>{route.supervisorResponse.data.message_id} · {route.supervisorResponse.data.body_sha256}</code></dd></div>}
      {route.resolution && <div><dt>Supervisor resolution</dt><dd><code>{route.resolution.data.message_id} · {route.resolution.data.body_sha256}</code></dd></div>}
    </dl>
    {route.directChatUrl && route.status !== "RESOLVED" && <a href={route.directChatUrl} target="_blank" rel="noreferrer">Open exact supervisory message</a>}
  </article>;
}
