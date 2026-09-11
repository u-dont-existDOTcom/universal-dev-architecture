// The single global authority lives in Mission Control's single-writer daemon.
// This source-tree re-export keeps deterministic contract tests reusable; it is
// not included in, or required by, the installed VPS relay.
export * from '../../restored/codex-mission-control/lib/provider-submission-authority.mjs';
