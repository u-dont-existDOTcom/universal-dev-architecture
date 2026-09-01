#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
SOURCE="$ROOT/restored/codex-mission-control"
ARCHIVE_DIR="$ROOT/source-archive"
WORK=$(mktemp -d /tmp/codex-mission-control-package.XXXXXX)
trap 'rm -rf -- "$WORK"' EXIT

(
  cd "$ROOT/restored"
  find codex-mission-control -type f \
    ! -path '*/node_modules/*' \
    ! -path '*/.next/*' \
    ! -path '*/data/*' \
    ! -path '*/.openai/*' \
    ! -path '*/.superdesign/*' \
    ! -name 'tsconfig.tsbuildinfo' \
    ! -name '.DS_Store' \
    -print | LC_ALL=C sort > "$WORK/files.txt"
  zip -q -X "$WORK/codex-mission-control.zip" -@ < "$WORK/files.txt"
)

unzip -tq "$WORK/codex-mission-control.zip"
base64 --wrap=76 "$WORK/codex-mission-control.zip" > "$WORK/codex-mission-control.zip.b64"
split -b 8000 -d -a 3 "$WORK/codex-mission-control.zip.b64" "$WORK/codex-mission-control.zip.b64.part-"
cat "$WORK"/codex-mission-control.zip.b64.part-* | base64 --decode > "$WORK/reconstructed.zip"
cmp "$WORK/codex-mission-control.zip" "$WORK/reconstructed.zip"

mkdir -p "$ARCHIVE_DIR"
rm -f -- "$ARCHIVE_DIR"/codex-mission-control.zip.b64.part-*
cp "$WORK"/codex-mission-control.zip.b64.part-* "$ARCHIVE_DIR"/
digest=$(sha256sum "$WORK/codex-mission-control.zip" | cut -d' ' -f1)
printf '%s  codex-mission-control.zip\n' "$digest" > "$ROOT/SOURCE-ARCHIVE.sha256"

printf 'Packaged %s source files into %s parts; SHA-256 %s\n' \
  "$(wc -l < "$WORK/files.txt")" \
  "$(find "$ARCHIVE_DIR" -maxdepth 1 -name 'codex-mission-control.zip.b64.part-*' -type f | wc -l)" \
  "$digest"
