import type { OperatorStatusProjection } from "@/lib/operator-status-contract";
import type { SupervisorActivity, SupervisorRequestActivity } from "@/lib/supervisor-activity";
import { timeAgo } from "@/lib/owner-view";

export const SUPERVISOR_REQUEST_ORIGIN: Record<SupervisorRequestActivity["origin"], string> = {
  ROUTINE_CHECK: "Mission Control's routine check",
  WORK_QUESTION: "A question from the task's Work thread",
  OWNER_ANSWER: "Your answer, passed on",
  AFTER_WORK: "Review after a Work run",
  SOURCE_REVIEW: "Source review",
  OTHER: "A question",
};

export const SUPERVISOR_REQUEST_STATE: Record<SupervisorRequestActivity["state"], string> = {
  QUEUED: "Waiting to be sent",
  WAITING: "Waiting for an answer",
  SENT: "Sent; the supervisor is working on it",
  FINISHED: "The supervisor finished; its answer isn't recorded yet",
  ANSWERED: "Answered",
  NO_ANSWER: "Sent, but no answer came back before it expired",
  EXPIRED: "Expired without an answer",
  EXPIRED_UNSENT: "Never sent; it expired",
  WITHDRAWN: "Withdrawn before it was sent",
  REPLACED: "Its answer couldn't be used, so it was asked again",
};

function clip(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1).trimEnd()}…`;
}

/**
 * One sentence for a task card: what its supervisor was last asked and where that stands. Without the task's activity
 * (a snapshot that doesn't carry it) nothing is known, which is not the same as nothing asked.
 */
export function supervisorStatusLine(activity: SupervisorActivity | undefined | null, now = new Date()): string {
  if (!activity) return "Not available right now.";
  const latest = activity.requests[0];
  if (!latest) return "Not asked anything yet.";
  const asked = `Asked ${timeAgo(latest.queuedAt, now)}`;
  switch (latest.state) {
    case "ANSWERED": return `Answered ${timeAgo(latest.answeredAt!, now)}: ${clip(latest.answer ?? "decision recorded", 220)}`;
    case "SENT": return `${asked}; sent ${timeAgo(latest.sentAt!, now)}, working on it.`;
    case "FINISHED": return `${asked}; finished ${timeAgo(latest.finishedAt!, now)}, answer not recorded yet.`;
    case "NO_ANSWER": return `Sent ${timeAgo(latest.sentAt ?? latest.queuedAt, now)}; no answer came back before it expired.`;
    case "WAITING": return `${asked}; waiting for an answer.`;
    case "EXPIRED": return `${asked}; it expired ${timeAgo(latest.expiresAt!, now)} without an answer.`;
    case "EXPIRED_UNSENT": return `${asked}; never sent, and it expired ${timeAgo(latest.expiresAt!, now)}.`;
    case "WITHDRAWN": return `${asked}; withdrawn before it was sent.`;
    case "REPLACED": return `${asked}; its answer couldn't be used, so it was asked again.`;
    default: return `${asked}; waiting to be sent.`;
  }
}

/** The worker page's list: the latest questions its supervisor chats got, their state, the answer and the chat. */
export function SupervisorActivityPanel({ activity, now = new Date() }: { activity: SupervisorActivity | undefined | null; now?: Date }) {
  if (!activity) {
    return (
      <section className="supervisor-activity" aria-labelledby="supervisor-activity-title">
        <h2 id="supervisor-activity-title">What its supervisor is doing</h2>
        <p className="muted">Its supervisor questions aren&apos;t available right now.</p>
      </section>
    );
  }
  const current = activity;
  return (
    <section className="supervisor-activity" aria-labelledby="supervisor-activity-title">
      <h2 id="supervisor-activity-title">What its supervisor is doing</h2>
      <p className="muted">
        Each question opens a fresh ChatGPT chat with a write-up of the task's current state.{" "}
        {current.total
          ? `${current.total} question${current.total === 1 ? "" : "s"} so far, ${current.answered} answered${current.lastAnsweredAt ? `, the last ${timeAgo(current.lastAnsweredAt, now)}` : ""}.`
          : "Its supervisor hasn't been asked anything yet."}
      </p>
      {current.requests.length > 0 && <ol className="supervisor-requests">
        {current.requests.map((request) => <li key={request.requestId} className={`supervisor-request ${request.state.toLowerCase()}`}>
          <div className="supervisor-request-head">
            <strong>{SUPERVISOR_REQUEST_ORIGIN[request.origin]}</strong>
            <span>{SUPERVISOR_REQUEST_STATE[request.state]}</span>
          </div>
          {request.question && <p className="supervisor-request-question">{request.question}</p>}
          <p className="supervisor-request-times">
            Asked {timeAgo(request.queuedAt, now)}
            {request.sentAt ? ` · sent ${timeAgo(request.sentAt, now)}` : ""}
            {request.finishedAt ? ` · finished ${timeAgo(request.finishedAt, now)}` : ""}
            {request.answeredAt ? ` · answer recorded ${timeAgo(request.answeredAt, now)}` : ""}
          </p>
          {request.answer && <p className="supervisor-request-answer">{request.answer}</p>}
          {request.conversationUrl && <a className="supervisor-link" href={request.conversationUrl} target="_blank" rel="noreferrer">
            <span className="chat-glyph" aria-hidden="true">◫</span><span>Open this chat</span><span aria-hidden="true">↗</span>
          </a>}
        </li>)}
      </ol>}
      {current.total > current.requests.length && <p className="muted">Showing the latest {current.requests.length}.</p>}
    </section>
  );
}

/**
 * The first screen's line about supervision as a whole: whether the relay that sends questions to ChatGPT (and opens
 * the supervisor chats) is up, and when a supervisor question last went out. Without operator status it says nothing; the page's own
 * notice covers a failed read. `lastQuestionAt` undefined means the questions aren't known right now (no current task
 * data), so it makes no claim about them.
 */
export function SupervisionHealthLine({ status, lastQuestionAt, now = new Date() }: { status: OperatorStatusProjection | null; lastQuestionAt: string | null | undefined; now?: Date }) {
  if (!status) return null;
  // The supervisor questions' own send time, not the relay's last send of any kind (provisioning, Work journals...).
  const sent = lastQuestionAt === undefined ? "When a supervisor question last went to ChatGPT isn't known right now."
    : lastQuestionAt ? `The last supervisor question went to ChatGPT ${timeAgo(lastQuestionAt, now)}.` : "No supervisor question has reached ChatGPT yet.";
  // Mission Control's routine checks always ask the Project Manager supervisor; without one they have no one to ask.
  const manager = status.supervisors.find((supervisor) => supervisor.scope === "PROJECT_MANAGER");
  const managerGap = !manager
    ? "No Project Manager supervisor chat is set up, so Mission Control's routine checks have no one to ask."
    : manager.registrationState !== "ACTIVE"
      ? "The Project Manager supervisor chat hasn't been created yet, so Mission Control's routine checks have no one to ask."
      : null;
  if (status.providerRelayState === "HEALTHY" && !managerGap && manager!.reachable) {
    return <p className="supervision-health healthy" role="status">Supervisor chats can be reached: the relay to ChatGPT is up and the Project Manager supervisor has been reached. {sent}</p>;
  }
  if (status.providerRelayState === "HEALTHY" && !managerGap) {
    return <div className="supervision-health down" role="alert">
      <strong>The Project Manager supervisor isn't proven reachable yet.</strong>
      <p>The relay to ChatGPT is up, but nothing shows a question reaching the Project Manager supervisor chat yet. {sent}</p>
    </div>;
  }
  if (status.providerRelayState === "HEALTHY") {
    return <div className="supervision-health down" role="alert">
      <strong>Routine supervisor checks can't run.</strong>
      <p>{managerGap} {sent}</p>
    </div>;
  }
  const hosts = status.hosts.length
    ? status.hosts.map((host) => `${host.label}: relay ${host.relayWorkerState.toLowerCase()}, browser ${host.browserState.toLowerCase()}, ${host.reportFresh && host.observedAt ? `reported ${timeAgo(host.observedAt, now)}` : "no fresh report"}`).join(" · ")
    : "no relay host has reported";
  return <div className="supervision-health down" role="alert">
    <strong>Supervisor chats can't be reached right now.</strong>
    <p>The relay that sends questions to ChatGPT and opens the supervisor chats is {status.providerRelayState === "DEGRADED" ? "degraded" : "unavailable"}, so questions wait until it's back. {sent}</p>
    {managerGap && <p>{managerGap}</p>}
    <p className="muted">{hosts}</p>
  </div>;
}
