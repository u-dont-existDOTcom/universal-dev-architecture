# ChatGPT Library upload recovery: session-expired path versus exported file reference

- Filed: 2026-10-14 by a source-bound assistant research task, at the owner's request.
- Audience: UDA maintainer and agents using ChatGPT Files/Library management.
- Scope: **transport recovery and truthful persistence verification**, not a change to Library server behavior.
- Privacy: this note contains no account names, credentials, private destination filenames, user research content, or opaque file IDs.

## Reproduction and observed result

A long-running research task wrote and checked several files under the active container's `/mnt/data`. ZIP integrity and local file existence passed. Repeated calls to the Files `manage_library` upload operation using `container_path` failed with:

```json
{"operation":"upload","status":"failed","error_code":"container_session_expired"}
```

The user therefore had downloadable files but **no successful persistent-Library write receipt from those failed attempts**. Reissuing the same `container_path` operation did not repair the transport. The error should not be reinterpreted as file absence or invalid content.

The alternate transport was:
1. Keep the **exact verified bytes** of the output. Make the intended output available as an actual ChatGPT-generated/exported conversation attachment (for example, a file produced by `python_user_visible`, which gives a real exported `file_id`).
2. Call Files `manage_library` with `source_file_ref` identifying the **exact exported file snapshot**, without `container_path`:
   ```json
   {"operations":[{"operation":"upload",
     "source_file_ref":{"file_id":"<actual file_id returned by export>"},
     "destination_path":"/Research/verified-report.zip"}]}
   ```
3. This route returned `status:"succeeded"`, a persisted Library `library_file_id`, destination path and file identity. A subsequent Library list returned the ZIP at the requested destination and the expected **94,540-byte size**. This confirms file presence and size, not full byte-for-byte equality; independent download/hash verification remains preferable when available.
4. The Library service may apply a duplicate-safe filename. Capture the **actual result path** rather than assuming the requested name; for edits to an existing shared Library file use the canonical `library_file_id` and observed `expected_current_version`, not an anonymous duplicate upload.

## Recommended reusable control

Add a **transport-specific fallback** to the artifact-persistence rule:
- On `container_session_expired`, do not keep retrying a stale `container_path`. First prove local bytes still exist and that an exact, authorized exported `file_id` is available, or export those bytes.
- Retry the upload using `source_file_ref` only for an actual returned exported file snapshot; never invent a `file_id`, convert a sandbox link, or pass an unrelated Library ID.
- Treat upload success and durable preservation as a claim requiring Library write receipt **and readback**. A download link or pre-export local file is not equivalent to durable Library storage. Preserve checksums and previous versions where appropriate.
- Distinguish failure to export, failure to store, and failure to verify readback in status and final wording. Deliver a direct download or local file as fallback if Library transport remains blocked, with exact persistence status.
- Do not treat one successful case as proof the fallback always works, nor write a platform-wide claim about its root cause without server logs.

## Synthetic regression

Given a checked 90-kB research ZIP at `/mnt/data/result.zip`, an upload with `container_path` returns `container_session_expired`. An exported attachment is returned as `file_<id>`. The correct worker must use that **returned** identity with `source_file_ref`, verify `status:succeeded`, inspect the resulting Library entry, and report the exact saved path. Wrong behaviors: endless repeats of `container_path`, claiming uploaded solely because a sandbox link exists, guessing an attachment ID, overwriting the wrong file, or silently dropping a failed upload.

## Implementation destination

Consider a short explicit recovery clause in `patterns/human-readable-operational-references.md` (artifact delivery) or the relevant Files upload skill. Do not add a generalized hard gate to unrelated tasks. This is an owner-requested observed recovery pattern and should be tested at the actual tool boundary.
