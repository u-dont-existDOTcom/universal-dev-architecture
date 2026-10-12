# Correct public UDA suggestion routing and personal-data screening

- For: `u-dont-existDOTcom/universal-dev-architecture`
- Filed: 2026-10-12, by the ChatGPT research-handoff assistant
- From: a direct owner correction in the active chat, followed by an audit of current UDA instructions, recent GitHub commit metadata, and the GitHub Contents API contracts. No private conversation transcript or personal medical narrative is included.
- Owner request: yes — use a pull request for UDA repository suggestions, apply `suggested-fixes/README.md` exactly, and exclude personal health details and experiences from this public repository.
- Existing pull request: the pull request introducing this report
- Supersedes: none

## What to do

1. Treat **any write to the UDA repository** as a UDA-repository change, including `suggested-fixes/AskRigor/` and all other project suggestion lanes. Create a non-default branch first; pass that exact branch to every GitHub `create_file`, `update_file`, and `delete_file` call; open a PR against main; add the `uda-lane` label and one concise handoff comment. Never use the Contents API's omitted/`null` branch default for UDA mutations.
2. Apply the metadata and section structure of `suggested-fixes/README.md` to each new project-lane item. Verify mandatory fields and the `What to do` → `Why` → `Check first` order before committing.
3. Before **any public branch push, commit, PR, comment, log excerpt, or issue**, screen for private/user-specific information. **Do not include the owner's personal health details, health experiences, treatments tried, personal medical chronology, individual contacts, raw chat, or paraphrased first-person narratives**, including ostensibly deidentified examples. Substitute a synthetic/generalized regression case documenting only the transferable failure mechanism.
4. For already public material that may expose private content, assess affected current files and reachable history without repeating the information in another public artifact. Notify the owner privately about the disclosure and concrete remediation choices; a file deletion or redaction PR alone does **not** eliminate the historical public commit objects, caches, or mirrors. Any history rewrite, visibility change, or destructive cleanup is a separate owner-authorized decision.
5. Add a pre-write admission check: **is the target repository UDA, is the explicit head branch non-default, does the document pass the public-data screen, and is the handoff PR/label/comment path planned?** A privileged bypass is not permission to skip this path. Treat failed preflight as a stop without writing, not as an occasion to fall back to main.
6. Where practical, add deterministic regression coverage for metadata/heading structure and branch assertions around UDA writing helpers. Semantic privacy clearance remains a reviewer/author obligation, not something a simple keyword scanner can certify. Consider branch-ruleset changes that remove routine bypass for suggestion filings if feasible, but do not modify administrator bypass grants without a separate owner decision.

## Why

This assistant used the GitHub Contents API to create or update **five public suggestion files through six directly committed operations** in one research thread, rather than proposing them in PRs. The `branch` argument was omitted; the connector contract states that omission targets the repository's default branch. UDA's recorded branch-ruleset configuration grants the owner account a bypass, and this tool session wrote using that authorization. Thus branch protection did not reject the erroneous calls.

The task was misclassified as "filing in AskRigor's lane" rather than "mutating files hosted in public UDA." But `suggested-fixes/README.md` and `patterns/suggested-fix-queue.md` require a `uda-lane` PR for **changes to this repository**. Two of the affected item files also failed the README's precise header/metadata structure, indicating the filing-format check was not applied. Some content imported owner-specific context from the active chat into a public research suggestion. No personal examples are reproduced in this report.

This is a **confirmed assistant instruction-following and preflight failure**. The presence of privileged API access explains the mechanism; it does not authorize bypassing the review or privacy requirements. The incident should not be attributed to another session or agent without its own write evidence.

## Check first

- Read `AGENTS.md`, `suggested-fixes/README.md`, and `patterns/suggested-fix-queue.md` from the live default branch. They already explain public visibility and the `uda-lane` PR route.
- Confirm which exact source commits and current files need confidential incident handling without copying sensitive passages into a public PR or public issue. This report intentionally omits the individual narratives and direct content.
- Verify the authentication/bypass topology: `.github/codex-repository.json` records a default-branch ruleset with a user bypass, while the Contents API defaults to main when `branch` is omitted.
- Do not silently rewrite history, change repository visibility, re-publish private content in a redaction diff, or claim that ordinary commits become confidential when removed from the current default branch.
- For this report, enforce the same UDA branch/PR/label/comment workflow being repaired, and verify its branch content against main before declaring the handoff filed.

## Exact text

"For every file written into the public universal-dev-architecture repository—including a suggestion addressed to a different project—create a non-default topic branch, explicitly pass it to the write action, and open a pull request labeled `uda-lane` with the required handoff comment. Never default a UDA Contents API write to main. Before any public operation, exclude user-specific personal health information and experiences, even if summarized or deidentified. If a possible exposure already exists, do not reproduce it in public artifacts; notify the owner privately and obtain the required decision about history/publication remediation."

## Regression cases

- Filing an AskRigor suggestion with `create_file` and an omitted `branch`: the executor must reject before contacting GitHub; having a privileged owner bypass must not change the expected behavior.
- Filing an AskRigor suggestion with explicit topic branch: verify a PR targeting main, `uda-lane` label, and one handoff comment; no direct change to main.
- An item missing `From`/`Supersedes` or the mandatory heading order: reject/rewrite on the branch before handoff.
- An item distilled from a personal medical discussion: preserve only a generalized research-method regression; exclude the owner's actual personal narrative and specifics.
- A proposed public redaction of already committed private material: identify public-diff/history risks and request a separate controlled remediation path, rather than claiming the material has been erased.
