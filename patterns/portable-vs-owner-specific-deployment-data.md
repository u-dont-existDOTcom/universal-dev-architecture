# Portable architecture vs owner-specific deployment data

## Rule

A repository intended to be copied or reused by other owners must distinguish **portable architecture** from **owner-specific deployment state**.

Portable patterns, templates, tests, schemas, invariants, and examples belong in reusable paths and must not assume one person's hosts, account names, service IDs, machine paths, private chat locators, credentials, or operational topology.

Owner-specific infrastructure may be preserved when it is needed for continuity, recovery, or live-operation evidence, but it must be explicitly marked and isolated.

## Required classification

Every artifact whose meaning materially depends on one owner's actual infrastructure must carry an obvious classification such as:

`NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT`

or an equivalent unambiguous heading/field.

Examples include:

- actual VPS provider/host role assignments;
- hostnames, instance IDs, service IDs, deployment IDs, and private machine paths;
- actual browser-profile locations;
- owner-specific supervisor/chat registries or chat locators;
- owner-specific account/workspace labels;
- migration checkpoints and failover status for the owner's live machines.

Do **not** put passwords, tokens, cookies, private keys, session storage, browser profiles, or other secrets in Git, even inside a non-universal artifact.

## Portable extraction rule

When an owner-specific incident produces a generally useful lesson, split the result:

1. put the reusable mechanism/invariant in `patterns/`, `templates/`, tests, or other universal surfaces;
2. put the owner's concrete deployment/topology/evidence in an explicitly `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT` artifact;
3. link the two without making the universal rule depend on the owner's identifiers.

A copied repository should remain understandable and useful after all `NON_UNIVERSAL / EXAMPLE_OWNER_DEPLOYMENT` artifacts are ignored or replaced.

## Mission Control example

Portable:

- a shared control-plane submission queue;
- one global send lease across all execution hosts;
- per-host local pacing as defense in depth;
- exact automation-owned browser/window/target ownership;
- dedicated supervisor-chat registry with fail-closed target selection;
- host health and deterministic failover rules;
- no reliance on a human owner's clipboard or personal browser window.

Owner-specific:

- which VPS provider is primary or secondary;
- the actual RAM sizes and host identities;
- concrete service names, hostnames, ports, profile directories, and deployment receipts;
- actual registered supervisor conversation locators.

## Review rule

Before merging infrastructure guidance into a copyable repository, ask:

> Would this still be useful and correct for another owner after replacing all concrete hosts, accounts, chat locators, and service IDs?

If not, mark and isolate the artifact as owner-specific rather than presenting it as universal architecture.
