# Owner-marked failure: a question asked after the owner had already chosen

- Date: 2026-10-11
- Reported by: the owner, to the Claude Code session running the InnerSignal journal import, with the request to debug the failure and send the report to this repository's maintainer lane.
- Source quality: `EXACT_TEXT` for the owner's messages quoted here; `BOUNDED_SUMMARY`, with short exact quotes, for the agent's own messages.
- Digest: SHA-256 of the owner's correction as sent (UTF-8): `5dfdc51802f0afb5742c4a10688ee5d24a105bc6b53b499f15a79d2f4818a37d`.
- Capture state: `CAPTURED_BRANCH_ONLY` until the pull request that adds this file merges.

## The owner's correction

> 21a i already told you that before, i said swtich to the new quick method, why did you not listen? debug that and send error report to UDA lane

## What happened (UTC, 11 October 2026)

- **01:03.** The owner: "ok i mean i do want to make this journal import just happen in a few hours for the public, not weeks. but i also don't want so many gaps and errors and failures..."
- **Shortly after.** The agent answered that the fast route was a new method, the pointer pass, and that it was writing it up. It added: "The current import keeps running meanwhile; whether it's still needed is a decision for after the pointer pass works."
- **01:41.** The slow import stopped on its own: a test round went past its limit of critical misses.
- **Just after 01:53.** The agent told the owner that the import had stopped, and asked owner question 21 with three options: A, leave it stopped and let the new method build the result (recommended); B, lower the bar and finish the round, then weeks of running; C, find the cause and run a new round, about a week, then weeks of running.
- **The next 20 hours.** The question stayed open across several turns. One of them was a scheduled follow-up whose prompt, written by the agent, told it to check whether the owner had answered question 21.
- **22:14.** The owner sent the correction above.

## Mechanism

1. **A goal was not read as a decision.** The 01:03 message settled the outcome: hours, not weeks, and fewer errors. Of the three options only A fitted it, since B and C each meant weeks. Leaving a stopped import stopped needed no new authority. Nothing was left for the owner to decide. Root `AGENTS.md` (Workflow) says to minimize owner choice and ask only about a material tradeoff; `patterns/logic-failure-map.md` LF-1.5 names the failure: asking about a decision that isn't the owner's to make.
2. **The agent turned its own deferral into an owner decision.** Its reply to the 01:03 message said that whether the old import was still needed was "a decision for after the pointer pass works". When the import stopped, the agent filled that open slot with a question. It never checked the slot against what the owner had said.
3. **A stop notice became a question.** The project's rule is to tell the owner whenever the import stops, together with what is needed to restart it. That rule asks for a notice. The agent read "what is needed to restart it" as "ask whether to restart it".
4. **The question was carried forward without a fresh check.** Later turns, including the self-written scheduled follow-up, checked only whether the question had been answered, never whether it still needed asking.

The rule was not missing. `patterns/owner-questions-page.md` rule 5 already says to resolve whatever the agent can decide before asking, and the pattern's problem statement names this failure: "answered ones get asked again". What the rule lacks is a step that makes the agent read the owner's own earlier words, so it did not fire on a direction given outside a numbered question.

## Affected controls

- `patterns/owner-questions-page.md`, rule 5.
- Root `AGENTS.md`, Workflow: minimize owner choice.
- `patterns/logic-failure-map.md`, LF-1.5.

## Repair proposed with this record

Rule 5 gets the missing step. Before a question goes on the page, and again whenever one has waited across turns, the agent reads what the owner has said on the workstream since its last decision. When his words already choose an option, or rule out all but one, the agent acts on it if that needs no new authority. It records the decision under Decided in his words, and names the other options in one line as an opt-out instead of asking. A notice that something stopped says what restarts it; it becomes a question only when restarting needs a choice his words don't cover. LF-1.5's quick check starts from the same step.

## Status

- **The InnerSignal journal workstream** acted on the owner's answer in the same turn. The import stays stopped, its scheduled check is switched off, and the project's state file records the miss.
- **Next verification:** this repository's maintainer lane reviews the pull request. `tests/test_owner_questions_page.py` holds the new rule text and this record.

No journal text, private locators or account identifiers are in this record.
