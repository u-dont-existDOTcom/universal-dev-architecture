import assert from "node:assert/strict";
import test from "node:test";
import { projectWorker, summarizeChanges } from "../lib/projection";
import { eventSchema, supervisorChatLinkSetSchema } from "../lib/schema";
import { ContractInvariantError, EventStore } from "../lib/store";

function objective(worker = "alpha") {
  return {
    type: "objective_created" as const,
    worker,
    worker_name: "Alpha worker",
    goal: "Implement one bounded change",
    acceptance_criteria: ["Tests pass"],
    allowed_scope: ["src/alpha/**"],
    forbidden_scope: ["src/core/**"],
    expected_max_diff_lines: 100,
    supervisor_chat_url: "https://chatgpt.com/c/replace-alpha-supervisor",
    supervisor_chat_label: "Open Alpha Pro supervisor",
  };
}

function heartbeat(worker = "alpha") {
  return {
    type: "worker_heartbeat" as const,
    worker,
    objective: "Implement one bounded change",
    status: "working" as const,
    current_step: "Writing the bounded change",
    completed_steps: [],
    next_steps: ["Run tests"],
    files_touched: ["src/alpha/change.ts"],
    tests: { passing: 4, failing: 0, lint: "passing" as const, build: "passing" as const },
    plan_changed: false,
    plan_change_reason: null,
    blocker: null,
    assumptions: [],
    diff_lines: 40,
  };
}

test("the event schema treats supervisor chat links as first-class validated data", () => {
  const parsed = supervisorChatLinkSetSchema.parse({
    type: "supervisor_chat_link_set",
    worker: "alpha",
    supervisor_chat_url: "https://chatgpt.com/c/real-supervisor-chat",
    supervisor_chat_label: "Open Pro chat",
    reason: "Connected the assigned supervisor",
  });
  assert.equal(parsed.supervisor_chat_url, "https://chatgpt.com/c/real-supervisor-chat");
  assert.throws(() => eventSchema.parse({ ...parsed, supervisor_chat_url: "javascript:alert(1)" }));
});

test("objective contracts are write-once and heartbeat objectives must match", () => {
  const store = new EventStore(":memory:");
  store.append(objective());
  assert.throws(() => store.append(objective()), ContractInvariantError);
  assert.throws(() => store.append({ ...heartbeat(), objective: "A different objective" }), ContractInvariantError);
  assert.equal(store.getObjective("alpha")?.goal, "Implement one bounded change");
  store.close();
});

test("a chat-link update appends history without mutating the objective contract", () => {
  const store = new EventStore(":memory:");
  store.append(objective(), "2026-08-30T10:00:00.000Z");
  store.append(heartbeat(), "2026-08-30T10:01:00.000Z");
  store.append({
    type: "supervisor_chat_link_set",
    worker: "alpha",
    supervisor_chat_url: "https://chatgpt.com/c/real-alpha-supervisor",
    supervisor_chat_label: "Open assigned Pro chat",
    reason: "Replaced the demo placeholder",
  }, "2026-08-30T10:02:00.000Z");

  const events = store.workerEvents("alpha");
  const state = projectWorker(events, new Date("2026-08-30T10:03:00.000Z"));
  assert.equal(events.length, 3);
  assert.equal(state.supervisorChatUrl, "https://chatgpt.com/c/real-alpha-supervisor");
  assert.equal(state.objective.supervisor_chat_url, "https://chatgpt.com/c/replace-alpha-supervisor");
  assert.equal(state.supervisorChatIsPlaceholder, false);
  store.close();
});

test("deterministic escalation overrides numeric score", () => {
  const store = new EventStore(":memory:");
  store.append(objective(), "2026-08-30T10:00:00.000Z");
  store.append({ ...heartbeat(), major_contract_violation: true }, "2026-08-30T10:01:00.000Z");
  const state = projectWorker(store.workerEvents("alpha"), new Date("2026-08-30T10:02:00.000Z"));
  assert.equal(state.driftScore, 0);
  assert.equal(state.health, "RED");
  assert.ok(state.warnings.some((warning) => warning.immediate && warning.code === "major_contract_violation"));
  store.close();
});

test("mark-viewed semantics summarize only later append-only events", () => {
  const store = new EventStore(":memory:");
  store.append(objective(), "2026-08-30T10:00:00.000Z");
  store.append(heartbeat(), "2026-08-30T10:01:00.000Z");
  store.markViewed();
  assert.equal(summarizeChanges(store.allEvents(), store.lastViewedEventId(), new Date("2026-08-30T10:02:00.000Z")), "No new worker or supervisor events since your last review.");
  store.append({
    type: "supervisor_chat_link_set", worker: "alpha",
    supervisor_chat_url: "https://chatgpt.com/c/real-alpha-supervisor",
    supervisor_chat_label: "Open Pro chat", reason: "Assigned the durable chat",
  }, "2026-08-30T10:03:00.000Z");
  assert.match(summarizeChanges(store.allEvents(), store.lastViewedEventId(), new Date("2026-08-30T10:04:00.000Z")), /chat link was updated/i);
  store.close();
});
