import { pathToFileURL } from "node:url";
import { EventStore, getStore } from "./store";

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

export function seedStore(store: EventStore = getStore()): boolean {
  if (store.count() > 0) return false;

  const records: Array<{ event: unknown; occurredAt: string }> = [
    {
      occurredAt: ago(38),
      event: {
        type: "objective_created", worker: "auth", worker_name: "Auth refactor",
        goal: "Refactor session validation without changing authentication behavior",
        acceptance_criteria: ["Existing auth tests pass", "Session validation is centralized", "No API behavior changes"],
        allowed_scope: ["src/auth/**", "tests/auth/**"], forbidden_scope: ["src/billing/**", "src/core/permissions/**"],
        expected_max_diff_lines: 320,
        supervisor_chat_url: "https://chatgpt.com/c/replace-auth-supervisor",
        supervisor_chat_label: "Open Auth Pro supervisor",
      },
    },
    {
      occurredAt: ago(32),
      event: {
        type: "worker_heartbeat", worker: "auth", objective: "Refactor session validation without changing authentication behavior",
        status: "working", current_step: "Consolidating session validation guards",
        completed_steps: ["Mapped existing auth entry points", "Added characterization tests"],
        next_steps: ["Finish guard extraction", "Run auth integration tests"], files_touched: ["src/auth/session.ts", "tests/auth/session.test.ts"],
        tests: { passing: 86, failing: 0, lint: "passing", build: "passing" }, plan_changed: false,
        plan_change_reason: null, blocker: null, assumptions: ["Public session payload remains unchanged"], diff_lines: 144,
      },
    },
    {
      occurredAt: ago(30),
      event: {
        type: "supervisor_verdict", worker: "auth", verdict: "ON_TRACK", alignment: 0.96,
        reason: "Changes remain inside the auth boundary and preserve observed behavior.", corrective_action: null,
        review_after: "next_commit", work_no_longer_serves_objective: false,
      },
    },
    {
      occurredAt: ago(34),
      event: {
        type: "objective_created", worker: "billing", worker_name: "Billing / webhooks",
        goal: "Implement retry-safe Stripe webhook handling using the existing event model",
        acceptance_criteria: ["Duplicate Stripe events are idempotent", "Integration suite passes", "Existing event model is retained"],
        allowed_scope: ["src/billing/**", "tests/billing/**"], forbidden_scope: ["src/shared/schema/**", "src/core/events/**"],
        expected_max_diff_lines: 380,
        supervisor_chat_url: "https://chatgpt.com/c/replace-billing-supervisor",
        supervisor_chat_label: "Open Billing Pro supervisor",
      },
    },
    {
      occurredAt: ago(24),
      event: {
        type: "worker_heartbeat", worker: "billing", objective: "Implement retry-safe Stripe webhook handling using the existing event model",
        status: "working", current_step: "Returning idempotency storage to the existing event model",
        completed_steps: ["Added event-key persistence", "Detected duplicate deliveries"],
        next_steps: ["Remove shared-schema experiment", "Add duplicate-event test", "Run integration suite"],
        files_touched: ["src/billing/webhooks.ts", "src/shared/schema/events.ts"],
        tests: { passing: 184, failing: 0, lint: "passing", build: "passing" }, plan_changed: true,
        plan_change_reason: "Initially generalized the schema, then reverted course after supervisor review", blocker: null,
        assumptions: ["Stripe event IDs are globally unique"], diff_lines: 271,
      },
    },
    {
      occurredAt: ago(22),
      event: {
        type: "supervisor_verdict", worker: "billing", verdict: "WATCH", alignment: 0.72,
        reason: "Worker introduced a shared-schema abstraction not required by the task.",
        corrective_action: "Finish idempotency using the existing event model.", review_after: "next_commit",
        work_no_longer_serves_objective: false,
      },
    },
    {
      occurredAt: ago(28),
      event: {
        type: "objective_created", worker: "ui", worker_name: "UI migration",
        goal: "Migrate the settings screen to the current component library",
        acceptance_criteria: ["Visual parity is maintained", "Accessibility checks pass", "Old screen route is removed"],
        allowed_scope: ["src/ui/settings/**", "tests/ui/settings/**"], forbidden_scope: ["src/api/**", "src/billing/**"],
        expected_max_diff_lines: 650,
        supervisor_chat_url: "https://chatgpt.com/c/replace-ui-supervisor",
        supervisor_chat_label: "Open UI Pro supervisor",
      },
    },
    {
      occurredAt: ago(18),
      event: {
        type: "worker_heartbeat", worker: "ui", objective: "Migrate the settings screen to the current component library",
        status: "blocked", current_step: "Waiting for the design-token package release",
        completed_steps: ["Migrated account panel", "Added keyboard navigation tests"],
        next_steps: ["Upgrade design tokens", "Migrate notification panel", "Run visual regression suite"],
        files_touched: ["src/ui/settings/account.tsx", "tests/ui/settings/a11y.test.tsx"],
        tests: { passing: 63, failing: 0, lint: "passing", build: "passing" }, plan_changed: false,
        plan_change_reason: null, blocker: "design-tokens v4 has not been published", assumptions: [], diff_lines: 302,
      },
    },
    {
      occurredAt: ago(17),
      event: { type: "blocker_reported", worker: "ui", blocker: "design-tokens v4 has not been published", legitimate_dependency: true },
    },
    {
      occurredAt: ago(16),
      event: {
        type: "supervisor_verdict", worker: "ui", verdict: "ON_TRACK", alignment: 0.93,
        reason: "The blocker is legitimate and completed work remains within the UI boundary.", corrective_action: null,
        review_after: "dependency_resolved", work_no_longer_serves_objective: false,
      },
    },
    {
      occurredAt: ago(26),
      event: {
        type: "objective_created", worker: "tests", worker_name: "Test cleanup",
        goal: "Remove flaky test setup and stabilize the test suite without changing production logic",
        acceptance_criteria: ["Flaky setup is removed", "Test suite passes twice consecutively", "Production logic is untouched"],
        allowed_scope: ["tests/**", "test-support/**"], forbidden_scope: ["src/core/**", "src/production/**"],
        expected_max_diff_lines: 250,
        supervisor_chat_url: "https://chatgpt.com/c/replace-tests-supervisor",
        supervisor_chat_label: "Open Test-cleanup Pro supervisor",
      },
    },
    {
      occurredAt: ago(13),
      event: {
        type: "worker_heartbeat", worker: "tests", objective: "Remove flaky test setup and stabilize the test suite without changing production logic",
        status: "working", current_step: "Rewriting the production scheduler to accommodate test timing",
        completed_steps: ["Removed duplicate fixtures"], next_steps: ["Replace scheduler implementation", "Update production callers"],
        files_touched: ["tests/setup.ts", "src/core/scheduler.ts"],
        tests: { passing: 411, failing: 7, lint: "passing", build: "failing" }, plan_changed: true,
        plan_change_reason: null, blocker: null, assumptions: ["Production timing semantics may be changed"],
        assumptions_materially_changed: true, diff_lines: 612, repeated_failure_count: 4,
        architecture_rewrite: true, architecture_rewrite_explained: false, major_contract_violation: true,
      },
    },
    {
      occurredAt: ago(11),
      event: {
        type: "tests_run", worker: "tests", command: "npm test", passing: 411, failing: 7,
        previously_passing_regressed: true,
      },
    },
    {
      occurredAt: ago(9),
      event: {
        type: "supervisor_verdict", worker: "tests", verdict: "REDIRECT", alignment: 0.21,
        reason: "The worker began rewriting production core logic for a test-only objective.",
        corrective_action: "Revert production changes and stabilize tests through fixtures and test-support utilities only.",
        review_after: "before_more_work", work_no_longer_serves_objective: true,
      },
    },
    {
      occurredAt: ago(8),
      event: {
        type: "redirect_issued", worker: "tests", reason: "Production core logic is explicitly out of scope.",
        corrective_action: "Stop implementation, revert core changes, and submit a scope-compliant plan.",
      },
    },
  ];

  store.appendMany(records);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inserted = seedStore();
  console.log(inserted ? "Seeded four demo workers." : "Database already contains events; no seed data added.");
}
