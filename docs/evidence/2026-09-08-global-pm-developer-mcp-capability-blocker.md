# Global Project Manager developer-MCP capability observation

Date: 2026-09-08

Scope: `mc-project-manager` only. This does not alter or invalidate the accepted specialist route-v4 evidence for `mc-hotfix-specialist`.

## Observed result

A bounded live `get_capability_challenge` attempt failed closed because the registered Project Manager provider conversation did not support the required developer-MCP execution in that turn. No GitHub verification/write was attempted and no `MISSION_CONTROL_CHAT_CAPABILITY_RECEIPT_V1` was created.

This proves only that the **direct PM-chat -> developer-MCP tool edge** was unavailable in that provider turn. It does **not** prove that the PM cannot participate in Mission Control coordination, and it does not invalidate the already-established controller-mediated workflow.

## Correct architecture interpretation

The working coordination pattern is controller-mediated and uses GitHub as the durable mailbox between reasoning chats:

1. Codex/controller reads the current Mission Control state and waits for the active reasoning chat.
2. The reasoning chat performs its own ordinary GitHub reads/writes directly in Chat; it must not delegate those routine GitHub operations to Work/Codex.
3. After the chat publishes its source-bound GitHub artifact, Codex/controller reads that artifact.
4. When another Mission Control supervisor or Project Manager chat is required, Codex/controller transports the exact required source-bound data to that registered chat and waits for it to finish.
5. That chat performs its own GitHub read/write and publishes the next durable artifact.
6. Codex/controller reads the new artifact and transports the required result back into the prior registered chat tab or continues the admitted Mission Control route.

This is **Chat <-> GitHub <-> Codex/controller <-> Chat** coordination. It is not native Chat-to-Chat communication, not Work-to-originating-Chat communication, and it does not require every reasoning chat to call Mission Control through developer MCP.

A reasoning chat can therefore "query Mission Control" operationally through the controller: Codex/controller obtains current Mission Control state and supplies the exact required state/binding/evidence to the reasoning chat. The reasoning chat remains the semantic authority and writes its own GitHub artifact; Codex/controller remains the transporter/execution coordinator.

## Automation constraint

Do not hand a routine GitHub read, decision write, issue comment, PR update, evidence receipt, or other ordinary supervisory GitHub operation from Chat to Work/Codex when Chat can perform it directly. Chat -> Work requires explicit user acceptance and can make the task invisible to the owner, breaking unattended Mission Control coordination.

Work/Codex remains appropriate for terminal/filesystem/SSH/browser/build/deploy mechanics and genuinely long-range/stateful repository execution. GitHub access by itself is not a Work requirement.

## Consequence for PM implementation

Do not add a new GitHub capability probe; Chat GitHub read/write capability is already established. Do not treat the failed direct developer-MCP attempt as a reason to redesign the whole PM route or remove Mission Control from the loop.

The next Mission Control implementation step is to make the controller-mediated PM/supervisor loop explicit and mechanically reliable: Codex/controller must wait on the exact GitHub artifact from each reasoning chat, transport the exact required Mission Control/GitHub state to the next registered chat, wait for its GitHub artifact, and resume the prior route without asking the owner to relay anything. The existing exact binding/hash, authority, replay, model/session, and production boundaries remain in force.

Production remains outside the authorization boundary.
