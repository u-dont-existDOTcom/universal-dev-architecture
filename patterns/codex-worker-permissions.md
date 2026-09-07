# Persistent Codex worker permissions

Status: current, version-bounded local-worker pattern. Owner-authorized repair and
validation on 2026-09-07 with **codex-cli 0.153.4**, Linux, and desktop package
**26.901.41600**. This is the permissions companion to
[codex-github-operating-system.md](codex-github-operating-system.md), not a second
workflow or supervision authority.

## Intended behavior

Routine engineering should continue without repeated human “always allow”
clicks. Keep file writes scoped to the effective workspace, enable development
network access, and send eligible exceptions to Codex's built-in automatic risk
reviewer. A saved technical permission never authorizes unrelated publication,
spending, privileged changes, or external commitments.

Use the existing operating-system pattern's **Owner-interruption decision test**
for uncertainty and supervisor escalation. Apply it to directly authorized local
workers as well as supervised workers; do not introduce Mission Control into an
ordinary task merely to obtain routine permission.

## What the investigation established

The affected installation had `approvals_reviewer = "user"`, no explicit default
sandbox/profile policy, and many saved rules containing an entire shell command,
temporary path, or environment assignment. The rules were persistent, but small
argument changes did not match them. Separately, the desktop remembered Full
Access, which supplied `never`, `user`, and unrestricted filesystem permissions.
These are different failure modes; repairing only one is insufficient.

Some old approvals also allowed broad authenticated API, push, package-script,
and privileged command families. Back up and review existing rules; do not
append a safer-looking file and assume old host-execution grants disappeared.
In this repair, useful GitHub read families were retained in normalized form;
script/manager execution moved back inside the sandbox and risky families moved
to review. Private local history and backup contents were not published.

## Supported configuration

Merge [the portable config fragment](../templates/codex-permissions/config.toml)
into the user configuration, preserving unrelated entries:

```toml
approval_policy = "on-request"
approvals_reviewer = "auto_review"
default_permissions = "routine-development"

[permissions.routine-development]
extends = ":workspace"

[permissions.routine-development.network]
enabled = true
```

The full fragment adds only selected package-cache write locations. It retains
the built-in reviewer policy and filesystem protections, grants no whole-home
write access, and adds no global interpreter/shell allow rule. Read access uses
the built-in workspace baseline; this is not a blanket secret-read firewall.
Unnecessary credential inspection remains prohibited by agent instructions and
the reviewer policy, with explicit review rules for credential-display commands.

`auto_review` is the verified spelling. The installed schema accepts the older
`guardian_subagent` alias; do not invent `approval_reviewer`, `guardian`, or
unsupported low-risk threshold fields. Keep the built-in review policy intact.
`never` prevents eligible prompts from reaching review. The older
`sandbox_mode` / `sandbox_workspace_write` settings are supported but take
precedence over named profiles; do not mix both configuration architectures.
The CLI's `--approve-for-me` shortcut selects the built-in workspace sandbox;
use the configured named profile when its additional network/cache rules matter.
[Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

The sandbox uses the **runtime workspace roots provided by the client**. An
ordinary repository worker should receive that repository or worktree, not its
entire parent project collection. This fragment adds no broad parent roots.
Inspect the roots returned by `thread/start` or the runtime environment; a
single-root fixture is not proof about every desktop project. A linked worktree
can require review for Git metadata outside its checkout.

Development networking here is direct and enabled. It is not an egress-domain
allowlist and does not authorize sending private data. If a repository requires
domain restrictions, add a narrowly tailored network profile and activate the
supported network proxy; domain entries alone do not enforce restrictions.
[Permission profiles](https://learn.chatgpt.com/docs/permissions).

## Persistent command rules

Install the reviewed [rule examples](../templates/codex-permissions/routine.rules)
under the active user's `rules/` directory. There is no portable working-directory
predicate in these prefix examples. In particular, an `allow` rule permits
execution **outside** the sandbox, so globally allowing `npm`, `python`, `bash`,
`node`, or arbitrary repository scripts would defeat workspace scoping.

```python
prefix_rule(pattern=["gh", "pr", ["view", "list", "checks"]], decision="allow")
prefix_rule(pattern=["git", ["commit", "fetch", "push", "reset", "clean"]], decision="prompt")
prefix_rule(pattern=["rm"], decision="prompt")
```

The full examples also cover selected absolute executable spellings and review
privileged commands, Git history/deletion operations, publication, and
credential-related GitHub commands. `gh api` is reviewed because methods/body
flags can turn it into a write. `gh auth status` is reviewed because `-t` and
`--show-token` reveal credentials.

Rules load from active configuration layers at startup; trusted repository
`.codex/rules/` layers can contribute too. The strictest matching rule wins:
`forbidden`, then `prompt`, then `allow`. A proposed “always” approval typically
lands in the user `rules/default.rules`. Complex shell strings can require
review even when their component commands look familiar.
[Rules](https://learn.chatgpt.com/docs/agent-configuration/rules).

## What executes and what remains protected

| Action | Intended route |
| --- | --- |
| Git status/diff/log/show, normal reads | Native sandbox; no broad Git host allow |
| Tests, lint, type checks, builds, local scripts | Native sandbox after inspecting repository authority/effects |
| Repository dependency installation and selected caches | Native sandbox; exceptional external writes use review |
| Development network requests | Enabled within the workspace profile |
| Selected PR/issue/check/run/repository reads | Narrow persistent GitHub CLI host allowances |
| Normal Git add/commit/fetch | Automatic review when protected Git metadata or a prompt rule requires it |
| Deletion, hard reset/clean, force pushes, history rewriting, branch/tag/remote deletion | Reviewed command families; require their actual authority and acceptable risk |
| Credential access, privilege/system changes, unrelated writes | Review rules and actual-effect policy; external writes blocked in the sandbox; no blanket grant |

Automatic review is not deterministic proof of safety. `prompt` reaches the
reviewer, not necessarily a human. A denial permits a materially safer path;
it never authorizes hiding the same action in another wrapper. If no safe path
exists, report the exact rejection and required user action. Some app-level
Computer Use permissions remain direct user prompts. Enterprise restrictions,
account eligibility, authentication/OS boundaries, and reviewer failures can
also require user involvement. Do not weaken those boundaries to claim zero
prompts. [Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review).

Prefix matching is not a universal destructive-operation firewall. Alternate
executables, `--git-dir=...` forms, scripts, direct API clients, and commands
inside already-writable roots are not exhaustively classified. Keep actual-effect
reasoning and the owner-interruption contract active. Do not claim that every
possible destructive operation is mechanically blocked.

## Desktop persistence and existing tasks

The inspected desktop stores a host-level permission selection separately from
TOML. Its new-task builder honors a named selection and leaves the reviewer to
configuration. Full Access explicitly overrides the configuration. Existing
tasks also retain their own policy/reviewer; changing a named profile alone
can preserve an old `never` or `user` setting.

Use the desktop's permission control: first choose **Approve for me** to set
an existing task's approval policy/reviewer, then select **routine-development**.
For this repair the native UI action was invoked through Linux accessibility;
the app itself persisted the new profile selection and a reviewed fallback.
No application binary or live JSON state was patched.

Implementation evidence for desktop 26.901.41600:

- `.codex-global-state.json`, `electron-persisted-atom-state`,
  `permission-selection-by-host-id:<host>` stores a named profile selection.
- `agent-mode-by-host-id` can otherwise retain a Full Access override.
- The app's persistence store holds an in-memory map and writes it back. Editing
  its JSON while it runs can be overwritten. Prefer the UI; if unavailable,
  perform a backed-up atomic edit only after a clean exit, then verify startup.

These are observed implementation details, not a stable public configuration
API. Do not copy another machine's global-state file or mass-rewrite historical
task records. New/default workers use the saved profile; old tasks must be
checked individually, especially if they explicitly selected Full Access.

## Reproduction and validation

1. Read `codex --version`, `codex --help`, `codex sandbox --help`, and
   `codex execpolicy check --help`. Inspect the actual desktop runtime too.
2. Back up the user config, rules, global instructions, and desktop selection
   privately. Check `CODEX_HOME`, named `<name>.config.toml` overlays,
   trusted project layers, `/etc/codex/config.toml`, managed requirements, and
   caller-supplied overrides. Never print authentication stores.
3. Merge the portable config, reconcile old rules, and incorporate the canonical
   owner-interruption test into global instructions. Select the desktop mode as
   above. Do not replace unrelated models, plugins, projects, or integrations.
4. Start a fresh `codex app-server --strict-config`. Use its generated protocol
   schemas, initialize the connection, then `config/read` with `includeLayers`
   and the repository `cwd`. Check origins and effective policy. Start a fresh
   task without permission overrides and inspect its profile, reviewer, policy,
   and runtime roots.
5. Run the rule matcher below. It executes no tested command, including the
   destructive examples. Pass every active rule file to check combined behavior.
6. In a disposable fixture, run normal write/test/build/package/network commands
   through `codex sandbox -C <fixture> -P routine-development -- <command>`.
   Assert that a sibling outside the roots cannot be written and `.git/config`,
   `.git/hooks`, and `.codex` remain protected. Test a linked worktree too.
7. Use a **persistent** fresh agent session to test normal staging/fetch/commit
   through actual automatic review; successful direct sandbox tests alone do
   not prove reviewer behavior. Use a local fixture remote and do not push.
8. Record real results and limits, restart the test process, and confirm the same
   disk policy is loaded. An app restart and a fresh app-server session are
   different tests; report which was performed.

```sh
python3 templates/codex-permissions/check_rules.py \
  --rules "$HOME/.codex/rules/default.rules"
codex execpolicy check --pretty \
  --rules "$HOME/.codex/rules/default.rules" -- git push origin main --force
codex app-server generate-json-schema --experimental --out ./work/codex-schema
codex app-server --strict-config
```

## Validation result on the repaired installation

- Two fresh app-server processes accepted the final config in strict mode and
  returned `routine-development`, `on-request`, `auto_review`, workspace-write,
  and enabled network access.
- The installed combined rules passed 36 actual matcher cases, including
  credential-display flags, dangerous Git variants, and absolute executables.
- Twelve final sandbox probes passed: repository writes, Git reads, dependency
  installation, test/lint/typecheck entry points, build, and network worked;
  outside writes and Git/Codex configuration changes were blocked. The tiny
  typecheck fixture validates execution permission, not a repository's types.
- A fresh persistent agent using the final default policy completed staging,
  local-remote fetch, a disposable empty commit, and linked-worktree staging.
  Each initially encountered the expected protected-metadata sandbox denial;
  automatic review approved the authorized action and each retry exited 0.
  No human approval was requested.
- The desktop itself persisted the named profile and its reviewed fallback.
  The whole desktop application was not restarted and other open tasks were
  not rewritten. Existing-task overrides and broader client-supplied roots
  remain inspection points.

## Version-specific failures and future diagnosis

Cheap experiments rejected superficially attractive configurations:

- Granting `.git` write while adding `.git/config` and `.git/hooks` read exceptions
  worked in a normal checkout but crashed the Linux sandbox for linked
  worktrees, whose `.git` is a file. Preserve the inherited Git boundary.
- With CLI 0.153.4, an `--ephemeral` agent test logged that session persistence
  was disabled and it could not create a guardian review fork. Escalated Git
  attempts remained read-only. Do not use that test mode to certify auto-review.

- A persistent agent session using explicit filesystem `deny` entries received
  genuine low-risk `allow` decisions for Git operations, yet the escalated
  commands still failed on read-only Git metadata. A comparison selecting a
  workspace profile without those deny entries succeeded. The installed template
  therefore omits explicit credential-denial entries and preserves the standard
  workspace boundary plus built-in review policy. This is an observed 0.153.4
  interaction, not a claim that deny rules are generally unsupported. Re-test
  after upgrades before adding those carveouts to the ordinary worker profile.

On future updates, repeat actual parsing and positive/negative probes. Inspect
reviewer enum changes, profile/legacy precedence, rule loading and executable
normalization, worktree mounts, named config overlays, desktop selection and
resume logic, effective roots, cache needs, and review-session persistence.
Do not respond to version drift by enabling Full Access or copying remembered
configuration keys.

Rollback is local: restore only changed sections/rules from the private backup
and use the desktop UI to restore its previous selection if appropriate. Keep
new unrelated user changes. The portable files contain no machine-private
paths, credentials, tokens, or private diagnostic logs.

## Transfer rationale and limits

Promoted from this owner-requested local repair because command-prefix fragility,
configuration/client precedence, and separate authorization/review/sandbox
layers recur across repositories. The portable configuration is a tested
starting point for this version, not a universal organization policy or a cloud
permission setup. Exact enforcement depends on client roots, platform/runtime,
managed restrictions, tools, and the active repository's instructions.
