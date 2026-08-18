# Task I — formal Codex Security pipeline

Audit and harden `readWorkspaceFile(root, userPath)` so it returns UTF-8 content only for regular files physically contained inside `root`. It must reject traversal, absolute escapes, sibling-prefix paths, directories, and symlinks that resolve outside the workspace while preserving legitimate nested reads.

This condition is intended to test the actual Codex Security plugin, not merely generic security reasoning. Run the standard repository/scoped-path Codex Security scan/tool pipeline against `src/`, validate any candidate relevant to this function, and then implement and verify the smallest portable remediation. Do not invoke deep/multi-pass mode. Do not create external tickets or publish anything. Do not stop after launching a scan: wait for its terminal result, finish the remediation, add regression coverage, run `npm test`, and inspect the final diff.

If the formal scan/tool surface is unavailable, report that as a capability failure and continue with native inspection so the code outcome remains measurable. Do not claim a formal scan ran unless a Codex Security tool actually returned evidence.
