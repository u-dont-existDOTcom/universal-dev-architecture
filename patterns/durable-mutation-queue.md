# Durable mutation queue

When a repository mutation cannot be completed, preserve the exact intended file bytes, SHA-256, destination path, branch, expected prior blob identity, and commit message in durable storage. Record a repository issue containing the stable storage object ID and the same identity metadata. A fresh session must reconcile any open receipt before declaring the originating task complete.
