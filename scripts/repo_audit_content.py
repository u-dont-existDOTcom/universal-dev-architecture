"""Audit package lockfiles and relative Markdown links."""
import json, re
from pathlib import Path
from scripts.repo_audit_types import Finding, finding

LINK_RE = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")

def check_lockfiles(root: Path) -> list[Finding]:
    package = root / "package.json"
    if not package.is_file():
        return []
    try:
        data = json.loads(package.read_text(encoding="utf-8"))
        has_dependencies = any(isinstance(data.get(key), dict) and data[key] for key in ("dependencies", "devDependencies", "optionalDependencies", "peerDependencies"))
    except (OSError, UnicodeError, json.JSONDecodeError):
        has_dependencies = True
    locks = ("package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock", "bun.lockb")
    if not has_dependencies or any((root / name).is_file() for name in locks):
        return []
    return [finding("NODE_LOCKFILE_MISSING", "package.json declares dependencies but no package-manager lockfile is committed.", "package.json")]

def check_markdown_links(root: Path) -> list[Finding]:
    out: list[Finding] = []
    ignored = {".git", "node_modules", ".venv", "venv", "dist", "build"}
    base = root.resolve()
    for path in root.rglob("*.md"):
        if any(part in ignored for part in path.relative_to(root).parts):
            continue
        for match in LINK_RE.finditer(path.read_text(encoding="utf-8", errors="replace")):
            raw = match.group(1).strip()
            if raw.startswith(("http://", "https://", "mailto:", "#", "data:")):
                continue
            target = raw.strip("<>").split("#", 1)[0].split("?", 1)[0]
            if not target:
                continue
            resolved = (path.parent / target).resolve()
            try:
                resolved.relative_to(base)
            except ValueError:
                out.append(finding("DOC_LINK_OUTSIDE_REPO", f"Relative documentation link escapes the repository: {raw}", str(path.relative_to(root))))
                continue
            if not resolved.exists():
                out.append(finding("DOC_LINK_BROKEN", f"Broken relative documentation link: {raw}", str(path.relative_to(root))))
    return out
