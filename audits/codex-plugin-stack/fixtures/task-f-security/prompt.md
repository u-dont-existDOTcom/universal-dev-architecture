# Task F — Security-sensitive change

Harden `readWorkspaceFile(root, userPath)` so it returns UTF-8 content only for
regular files physically contained inside `root`.

It must reject traversal, absolute escapes, sibling paths sharing the root's
string prefix, directories, and symlinks that resolve outside the workspace.
Legitimate nested files must continue to work. Add security regression tests,
keep the public API small, and verify both exploit rejection and allowed use.
