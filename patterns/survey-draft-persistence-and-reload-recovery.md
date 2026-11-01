# Survey draft persistence and reload recovery

## Activation

Apply whenever creating, modifying, repairing, or reviewing a browser-based survey or substantial multi-field form. This is a default for all owner surveys, not a feature that must be separately requested for each survey. Compose with `patterns/platform-native-deployment-before-new-infrastructure.md` for Apps Script forms and the project's privacy/data-handling rules. A project-specific owner instruction or validated regulatory requirement may override an implementation detail.

## Owner outcome

A participant who has begun filling a form must be able to reload accidentally and recover the unfinished answers on the same browser/device without retyping. A brief connection failure or ambiguous submission response must not silently lose answers or create duplicate records.

## Required behavior for new and updated surveys

1. **Synchronous local draft saving on edits.** Persist every named editable control's actual value on `input` and `change`, including textareas, numbers (including zero), dates, selects, multi-checkbox groups, radios, and consent flags. Also check for changes every approximately **10 seconds**, and flush on `pagehide` and hidden `visibilitychange`. Do not rely on unload alone. Save drafts before attempting an asynchronous submission.
2. **Automatic reload restoration.** Restore a valid unfinished draft before default initialization can overwrite it, including the original stable draft/report ID. Use an app-specific, versioned storage namespace rather than one global `surveyDraft` key. Distinguish drafts in multiple tabs using per-report IDs and tab-scoped identity that survives reload but is not accidentally shared by newly opened tabs (sessionStorage alone can be cloned from the opener). For reopening a draft in a fresh tab, offer an explicit **Recover saved draft** action with a warning about simultaneously editing another tab. Do not mix participants' submissions into one draft.
3. **Submission semantics.** A draft is not a submitted report. Only explicit submission sends the response to its backend. Retain the local draft on validation errors, server errors, timeouts, offline states, and unknown acknowledgment outcomes. Clear only the matching draft after a confirmed successful server response, and stop periodic autosave from resurrecting submitted answers as an unfinished second report. If the participant edits while submission is in flight, preserve the edits under a fresh report ID.
4. **Retry idempotency.** Where the server writes a row/record, enforce one durable response per stable report ID, ideally in a transaction or lock. Repeated identical requests must return an acknowledgment without appending a duplicate. A retry with conflicting answers must not silently overwrite the old record or claim the new answers were saved; preserve them as a new draft for explicit review/resubmission.
5. **Visibility and privacy.** Explain where unfinished answers are kept, that drafts remain local unless a separately disclosed server-backup feature exists, and that shared devices can expose browser-saved drafts. Display a useful saved/recovered/error indicator and offer a real **Discard unfinished draft** control. Detect blocked/quota-limited local storage and show a truthful warning; use session storage if possible with an explicit tab-only limitation. Avoid hidden server collection of partly completed survey answers. Use an appropriate confidentiality, retention, encryption, and consent design for regulated or unusually sensitive forms.
6. **Preserve existing behavior.** Do not remove questions, change meaning, change the backend response schema, publish drafts, or introduce new hosting merely to get autosaving. Backward-compatible, app-specific storage keys are preferred; a migration needs explicit version handling rather than assuming all browser states share a schema.

## Preferred reusable implementation

- Use `templates/survey-draft-autosave.js` for ordinary no-build HTML/JavaScript forms. It provides `createSurveyDraftAutosave({form, storagePrefix, statusElement, intervalMs:10000})` with `start()`, `saveNow()`, `fingerprint()`, `forget()`, `afterSubmission()`, and `discard()`.
- For Apps Script `HtmlService`, embed the portable module in `Index.html` and wire it to the existing `google.script.run` submit success/failure handlers; retain the native Web App unless another real requirement justifies different hosting.
- Server-side idempotency belongs in the survey's existing write endpoint, not in the client helper. Keep server schema and privacy/public export logic intact.
- The template stores only on the participant's device. It does **not** provide cross-device continuation, cloud backups, or recovery after browser data is cleared, nor does it prove storage survives every third-party iframe/privacy configuration. Test the actual deployed origin.

## Minimum behavioral acceptance checks

Before declaring an updated survey ready for deployment, run focused tests covering: edit a long answer and immediately reload; restore `0`, empty/unchecked states, a checkbox group, radio, date, select and participant/draft ID; reload after network failure; reload during a pending submission; retry an acknowledged or ambiguously acknowledged report without duplicates; preserve edits made while submitting; open two tabs; successful-submission cleanup without resurrecting a draft; discard and storage-disabled fallback. For Apps Script, confirm the deployed `/exec` Web App origin, not just a standalone HTML mock. A template unit test is evidence for the reusable module, not evidence that each integrating survey wired its handlers correctly.

## Provenance and transfer limits

Origin: owner instruction on 2026-11-01 following real participant answer loss on an accidentally reloaded Apps Script survey. The cross-project failure class is unsaved client form state and ambiguous submission retry handling.

This is a survey resilience default, not a mandate to collect unfinished submissions on the server. Browser storage is origin- and device-scoped; shared browsers and privacy modes change the risk and must be handled explicitly. Portable guidance and code must not include owner-specific survey responses, private backend addresses, spreadsheet IDs, or unpublished formulations.
