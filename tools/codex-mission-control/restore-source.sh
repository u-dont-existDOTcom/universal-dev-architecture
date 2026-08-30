#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
ARCHIVE_DIR="$ROOT/source-archive"
RESTORE_DIR="$ROOT/restored"
ZIP_PATH="$RESTORE_DIR/codex-mission-control.zip"

mkdir -p "$RESTORE_DIR"
cat "$ARCHIVE_DIR"/codex-mission-control.zip.b64.part-* | base64 --decode > "$ZIP_PATH"
(
  cd "$RESTORE_DIR"
  sha256sum -c "$ROOT/SOURCE-ARCHIVE.sha256"
  unzip -q -o codex-mission-control.zip
)

printf 'Restored source to %s\n' "$RESTORE_DIR/codex-mission-control"
