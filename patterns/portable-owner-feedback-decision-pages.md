# Portable owner-feedback decision pages

## Status and trigger

**Owner-requested universal rule (2026-10-23).** When the assistant has several independently actionable suggestions, edit proposals, review findings, or alternatives, and answering each one in chat would force the owner to reconstruct context or send many messages, **deliver a commentable decision page at the same time as the review**. Do not wait for the owner to request the interface after receiving a large static report.

This is about reducing feedback friction, **not an automatic item-count threshold**. Ask one conversational question for one essential choice, and use a short table or chat list when that is easier. In substantial editorial reviews, prefer an existing project review interface over inventing a replacement.

## User-facing interaction contract

Each independently actionable proposal must have a stable ID and sufficiently specific context to decide it. For a rewrite, show the exact original and proposed text; for a move, consolidation, or cut, show the actual source span, destination, dependent transitions, and disposition of unique content. "Tighten" or "shorten" without indicating precisely what changes is not an actionable proposal; do not flood the owner with such rows.

Provide explicit **Approve / Revise / Reject / Pending** choices and an editable note for each, plus optional overall feedback. Distinguish rejection from an untouched pending item. Start with pending, not inferred approval. Search, categories, filtered unanswered navigation, and visible progress help with long sets. A broad strategy approval is not authorization for every connected sample rewrite.

The page must export **parseable JSON** even when some items remain pending. Include a schema version, stable review and item IDs, exact article/source identity and hash, proposed operation and wording, individual status, full unmodified owner comments (including comments on pending items), and export time. Support re-import of source-identical responses for continuing across devices/accounts. Validate IDs and source identity on import and never map changed items by guesswork.

Use standalone offline-capable HTML or another verified equivalent without requiring a provider-specific store or network just to review and export. Avoid storing sensitive comments on public surfaces; a local artifact is a view of decisions, not a replacement for the proper durable owner-question/repository record. Never apply a decision to an article or publish it merely because it was selected on a review page.

## Preserve work when repairing or reissuing an interface

When the owner has already exported feedback, **ingest that file before regenerating the interface**. Carry over every explicit decision and the full text of notes, including notes attached to pending rows. Do not force the owner to repeat feedback. Keep source version, row IDs and status semantics stable; if any mapping changes, show a migration instead of silently remapping. Rejected recommendations stay rejected absent an explicit later owner correction.

Additional reviewer opinions are **advisory**. Show them separately from the owner's decisions; do not flip an existing approval merely because a second assistant objects. Preserve the source comments and both interpretations so the owner can choose.

## Form-field readability is a blocking usability check

An input may save typed text and export JSON correctly while rendering that text invisible. Light form fields combined with browser dark modes can display white letters on white.

For editable HTML controls explicitly set **foreground text, background, caret, and placeholder colors** (including WebKit text-fill behavior when relevant); do not rely on inherited text color or user-agent defaults. In light controls, make entered text visibly dark under both normal and dark browser color schemes. Test actual typed text, not just the DOM value.

Before saying an interactive page works, exercise representative approval, rejection, revision with Unicode notes, filters/search, export/download/JSON parse and re-import. Test with both light and dark browser preferences, inspect effective text/background colors for adequate contrast, and obtain a readable screenshot or other real-render evidence. Test local persistence and file navigation where possible; when automated browser policy blocks `file://`, describe that limitation and use injected-source interaction tests without falsely claiming the untested plane passed. A repaired page should default to imported owner decisions even when localStorage is unavailable.

## Scope and authority

This is a universal feedback-interface pattern, not a new mandatory form for simple conversations and not an authority to rewrite content, change a map, merge, publish, or impose additional approval gates. An owner answer or correction outranks earlier assistant proposals. Keep the project's existing full review contract when it provides stronger functionality; the universal rule adds the trigger and minimum usability expectations.

## Origin and rationale

Owner requested this on 2026-10-23 after a substantial article review made decision-by-decision chat feedback cumbersome. Later that day, the owner reported the generated review page had effectively invisible typed notes. The page had a white background but no explicit text color; feedback nonetheless survived JSON export. The repair was to specify robust input colors and test visible text, while restoring 25 exact decisions and not allowing a separate model's review to overwrite them. The failure mode transfers to any interactive approval or feedback artifact regardless of subject or author.