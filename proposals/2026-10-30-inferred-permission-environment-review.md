# Check an inferred agent-permission environment before it is applied

Date: 2026-10-30
Status: PROPOSAL / NOT ACTIVATED. Filed through the `uda-lane` route; the maintainer decides whether and where it
becomes a rule.
Scope: any project whose owner runs a tool that infers an agent's permission or safety-classifier environment from the
project, such as Claude Code's `/auto-mode-setup`.
Owner request: yes. The owner, on 30 Oct 2026, after the AskRigor session pointed out the error below: "i guess you can
send the report to the UDA lane".

## What happened

- The owner ran Claude Code's `/auto-mode-setup` in the AskRigor repository, for that project only and as a proposal.
  It read the project's files and the session's recent commands, and proposed an environment for the auto-mode safety
  classifier: trusted repositories, secrets, sensitive remote targets and soft-deny rules.
- It described the SSH alias of the project's production server as a Kubernetes namespace that "is not itself
  prod-named", and proposed soft-blocking only `kubectl` delete, apply and scale commands in that namespace. Its rule
  for sensitive remote targets was a name heuristic: a `prod` or `production` segment in the name.
- The likely cause: the session runs every remote command as `ssh -n <alias> ...`. There `-n` is ssh's flag that sends
  nothing on standard input, used so a remote `docker compose` call cannot read the rest of a script. The proposal read
  it as `kubectl`'s `-n <namespace>`.
- That server is production for several of the owner's projects, and its name contains no `prod`. Applied, the proposal
  would have told the classifier that the production server is an ordinary namespace, which could loosen its review of
  production commands. It was not applied: none of the project or user settings files has an `autoMode` block.

## Why it matters

The classifier's environment is part of the agent's own safety configuration. A wrong fact there doesn't show in
day-to-day work, and it weakens a gate without anyone noticing. A tool that infers it from commands sees syntax, not
what a command does, so the same misreading can recur in any project whose sessions use `ssh -n`. A name heuristic
also misses every production host whose name doesn't say so.

## Proposed rule

1. Before an inferred permission or classifier environment is applied, the agent working in the project checks every
   host, namespace, environment, data location and remote target it names against the project's own record of its
   production systems. It tells the owner which entries are wrong and what they should say, starting with anything the
   proposal calls non-production.
2. The owner applies the proposal, as proposed or corrected. The agent doesn't edit its own classifier configuration.
3. Each project names its production hosts, SSH aliases included, as production in its agent instructions or its
   deployment record, so a later inference can read them. Owner-specific names stay in the project, not here
   (`patterns/portable-vs-owner-specific-deployment-data.md`).
4. The tool's misreading goes to the tool's maker as a bug report.

## Placement

No UDA pattern covers Claude Code's auto-mode configuration: `patterns/codex-worker-permissions.md` covers Codex only.
This could be a new pattern with its enforcement-inventory entry, or a section of an existing one, as the maintainer
prefers.

## Check first

- Whether a current Claude Code version's `/auto-mode-setup` still reads `ssh -n` this way.
- Whether the owner wants rule 3 in every project now, or when each project next runs the setup.
