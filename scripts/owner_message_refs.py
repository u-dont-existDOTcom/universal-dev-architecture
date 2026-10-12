#!/usr/bin/env python3
"""Find file references in a message to the owner that he can't open.

Owner, 2026-10-12: "can you stop giving me paths to files that are relative to something? send that bug report to UDA i
thought i told you always give me a link to click or a file to look at". The rule was already in
patterns/human-readable-operational-references.md (Owner-facing artifact delivery) and in the logic failure map
(LF-9.3), as prose an agent applies from memory; nothing checked the message itself. This script does: write the
draft final message to a file, then

  python3 scripts/owner_message_refs.py DRAFT.md [--sent NAME ...] [--json]

It lists every path-like reference (a relative or absolute file path, a home-relative path, or a backticked file name)
that is neither a clickable link nor a file sent with the message (--sent takes the sent files' names or paths). Exit 1
when one is left: send the file, link it, or name the document in plain words instead.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys

EXT = r"(?:md|html?|json|jsonl|py|txt|csv|tsv|pdf|docx?|xlsx?|pptx?|js|ts|ya?ml|toml|sh|png|jpe?g|svg|zip)"
URL = re.compile(r"https?://\S+")
BACKTICK = re.compile(r"`([^`\n]+)`")
PATHLIKE = re.compile(
    r"(?<![\w@])("
    r"(?:~|\.{1,2})?/?(?:[\w.\-]+/)+[\w.\-]+(?:\.\w+)?/?"  # dir/sub/file.ext, ~/x/y, ./x, /abs/x
    r"|[\w\-]+(?:\.[\w\-]+)*\." + EXT +  # file.ext on its own
    r")(?![\w])"
)


def refs(text: str) -> list[str]:
    """Path-like strings in the text, links removed first."""
    body = URL.sub(" ", text)
    found = []
    for m in BACKTICK.finditer(body):
        inner = m.group(1).strip()
        if PATHLIKE.fullmatch(inner) and ("/" in inner or re.search(r"\." + EXT + r"$", inner)):
            found.append(inner)
    plain = BACKTICK.sub(" ", body)
    for m in PATHLIKE.finditer(plain):
        tok = m.group(1).rstrip(".,;:)")
        if "/" in tok and re.search(r"[A-Za-z]", tok) and not re.fullmatch(r"\d+/\d+(?:/\d+)?", tok) and not tok.endswith("/"):
            if re.search(r"\.\w{1,5}$", tok) or tok.startswith(("~/", "./", "../", "/")):
                found.append(tok)
        elif "/" not in tok and re.search(r"\." + EXT + r"$", tok):
            found.append(tok)
    out = []
    for f in found:
        if f not in out:
            out.append(f)
    return out


def unresolved(text: str, sent: list[str]) -> list[str]:
    names = {pathlib.PurePosixPath(s).name for s in sent}
    return [r for r in refs(text) if pathlib.PurePosixPath(r.rstrip("/")).name not in names]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("message")
    ap.add_argument("--sent", action="append", default=[], help="a file sent with the message (name or path)")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    text = pathlib.Path(a.message).read_text(encoding="utf-8")
    left = unresolved(text, a.sent)
    if a.json:
        print(json.dumps({"unresolved": left}, ensure_ascii=False))
    else:
        for r in left:
            print("NOT OPENABLE: %s (send the file, link it, or name it in plain words)" % r)
        print("verdict: %s" % ("FAIL" if left else "PASS"))
    return 1 if left else 0


if __name__ == "__main__":
    sys.exit(main())
