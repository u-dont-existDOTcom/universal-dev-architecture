# Same-chat stage liveness protocol

Status: implementation contract

Browser `GENERATION_COMPLETE` is transport evidence only. It does not prove that the chat finished the admitted reasoning objective.

For Mission Control-managed long supervisor stages, semantic liveness is carried through GitHub without browser output extraction.

## Receipt

Prefix:

```text
MISSION_CONTROL_CHAT_STAGE_RECEIPT_V1
```

Body:

```json
{
  "schema_version": 2,
  "request_id": "...",
  "request_nonce": "...",
  "supervisor_id": "...",
  "provider_session_id": "provider-session:...",
  "stage": "EXTRA_HIGH_READER | PRO_REASONER",
  "status": "STAGE_COMPLETE | CONTINUE_REQUIRED"
}
```

Mission Control accepts a current provider-session receipt only from the centrally configured stage-liveness issue and authorized GitHub writer, bound to the exact pending request, nonce, stable supervisor, provider session, stage, and admitted time window. Legacy schema-version-1 chat receipts remain parseable only for legacy route records; they cannot satisfy a schema-version-3 provider-session cycle.

## Extra High stage

An Extra High stage with no final decision receipt must write `STAGE_COMPLETE` only after its assigned stage objective is actually complete. It may write `CONTINUE_REQUIRED` if it can determine that more work is needed.

If the browser becomes idle but no current stage receipt appears within the liveness grace period, the relay sends `continue` in the same chat/model.

## Pro stage

Consumer-web Pro may not have the GitHub write surface. After the Pro generation becomes transport-idle, the relay switches the same conversation to Extra High for a narrow liveness validation turn:

- inspect the immediately preceding Pro turn using same-conversation context;
- do not reinterpret or replace the Pro decision;
- write a `PRO_REASONER` stage receipt with `STAGE_COMPLETE` or `CONTINUE_REQUIRED`.

If the receipt is `CONTINUE_REQUIRED`, the relay switches the same conversation back to Pro and sends exactly `continue`. After the next Pro turn, the Extra High validator checks again. Recovery is bounded by the configured stuck-recovery ceiling.

If `STAGE_COMPLETE`, the workflow proceeds to the Extra High writer.

## Authority

Stage receipts are liveness evidence only. They do not carry supervisor verdict authority, do not prove hidden model identity, do not prove exact Pro bytes, and cannot authorize Work/Codex execution by themselves.
