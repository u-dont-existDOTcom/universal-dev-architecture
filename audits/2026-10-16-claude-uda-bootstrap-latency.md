# Incident: a Claude turn spent about four minutes loading UDA rules

- **Date:** 2026-10-16
- **Recipient:** Universal Development Architecture (UDA) maintainer lane
- **Origin:** Owner-reported latency in a Claude chat (Claude Opus 5.5, max effort, cloud session with a shell)
- **Authority:** **OWNER REQUEST** — "chatgpt loads uda rules much faster, like at least 10x faster. So send bug report to uda lane." The owner asked for the UDA-loading part to be fixed first.
- **Privacy:** Extract, not a transcript. No conversation output, personal context, hosts or account identifiers.

## What happened

The owner asked a short conceptual question (what is concerning about a published document). ChatGPT at Extra High answered it in about two minutes, by the owner's report. The Claude turn took about 38 minutes in total. About four of those minutes went to loading this repository's rules before any task work began.

The four-minute figure comes from file timestamps in the session: the message was sent at a minute-resolution time, the clone finished about two minutes later, and task work started about four and a half minutes after the message. No single call was timed. A harness interruption at the very start of the turn falls inside those minutes and is not UDA's doing.

The bootstrap took about sixteen tool calls, each followed by max-effort reasoning:

1. A GitHub API read of `AGENTS.md`, refused with HTTP 403 because the session had no API attachment for the repository.
2. A repository attach request, which answered that anonymous git reads were already available.
3. A shallow clone.
4. Reading `AGENTS.md` (13 KB).
5. Two reads of `LESSON-INDEX.md` (45 KB): its head, then all of it.
6. Three calls exploring `scripts/uda_rule_graph.py`: its help, its schema, then `resolve` for ten selected rules. Six of them returned `unknown selected rule`, because the graph has 37 nodes and the repository has 89 pattern files.
7. Seven pattern reads, one file or section per call.

On the next two turns, `AGENTS.md` was re-fetched and was byte-identical (same sha256).

## Measurements

- **Fetch:** a shallow clone of this repository plus a hash of `AGENTS.md` took 1.9 seconds in one command (measured 2026-10-16). The fetch was never the cost.
- **New script:** `scripts/uda_bootstrap.py`, added in this pull request, prints the commit, `AGENTS.md`, and a compact index in 0.05 seconds. Its output is 32 KB, against 58 KB for the two full files.

## Mechanism

1. **No fast first route.** Nothing the agent reads before the fetch names the route. The agent tried the GitHub API first. In this runtime, an anonymous `git clone --depth 1` works.
2. **Rule-graph coverage gap.** Root `AGENTS.md` says unmapped rules stay index-routed. But nothing tells the agent which rules are mapped, short of trying `resolve` and failing.
3. **One file per call.** Nothing says to batch reads. At max effort, every extra round trip adds tens of seconds of reasoning.
4. **Unchanged bytes reread each turn.** The per-turn rule says a prior-turn fetch does not count. Agents therefore re-read 58 KB even when the fetched bytes match the copy already in context. A same-turn fetch with a hash comparison satisfies "re-fetch" without the reread.
5. **Long patterns, no short form.** `patterns/reasoning-selection.md` is 42 KB and `patterns/task-time-lesson-activation.md` is 29 KB. Neither has a short operative rule at the top, so a conversational turn reads deep sections to find the few lines it needs.

## Fix in this pull request

- `scripts/uda_bootstrap.py` and `tests/test_uda_bootstrap.py`. One call prints:
  - the commit;
  - `AGENTS.md`, or "unchanged" when `--known-sha` matches;
  - a one-line-per-entry index, with `[graph]` marking the 28 entries the rule graph covers;
  - any pattern files or line ranges passed with `--read`.
  
  The agent still selects which lessons apply; the script only prints the triggers.
- `patterns/github-first-agent-bootstrap.md` → **Fast per-turn bootstrap**: the two-call sequence and the hash rule.

With both in place, the bootstrap is two tool calls: a fetch plus the script, then the script again with `--read` for the chosen patterns.

## Left for the maintainer lane

- **Wiring.** Wire the script into the root per-turn invariant in `AGENTS.md`, beside the `turn_stamp.py` sentence. This pull request does not touch root `AGENTS.md`. Root size, the rule-graph clock metadata and the clause pins are the maintainer's call, as in `docs/requirements/2026-10-11-one-command-turn-stamp.owner-requirement.json`.
- **Hash rule.** Decide whether a same-turn fetch with a matching hash satisfies the per-turn re-fetch invariant. This pull request states it in the pattern, as a clarification, but the root sentence still reads as requiring a reread.
- **Short forms.** Consider an operative-rule summary of a few lines at the top of each pattern over about 15 KB.
- **Owner-side text.** The owner's claude.ai preferences carry their own bootstrap instruction, which this repository cannot edit. Once the script merges, give the owner replacement text: clone or pull, then run `python3 scripts/uda_bootstrap.py`.

## Out of scope

Most of the turn's 38 minutes were not UDA loading. The independent claim check took 9 minutes 53 seconds, and max-effort reasoning took most of the rest. Whether chat answers should cap or waive the claim check (`patterns/independent-evaluation-separation.md`) is a separate owner decision, not filed here.

## Nonclaims

- The four-minute split is estimated from file timestamps with a minute-resolution start; it was not timed per call.
- The ChatGPT comparison is the owner's observation; it was not measured here.
- The tests check the script's output; they do not show that a live agent will use it.
