#!/usr/bin/env bash
set -euo pipefail

# Reusable YouTube -> transcript workflow.
#
# Fast path: use YouTube-provided English subtitles/captions without API cost.
# Fallback: download audio with yt-dlp's current YouTube challenge/token stack,
#           then transcribe it with OpenAI gpt-4o-mini-transcribe.
#
# Usage:
#   scripts/yt-transcript.sh 'https://www.youtube.com/watch?v=...'
#
# Optional environment variables:
#   YT_TRANSCRIPT_OUTDIR       Output directory (default: ~/Téléchargements)
#   YT_TRANSCRIPT_MODEL        OpenAI transcription model (default: gpt-4o-mini-transcribe)
#   YT_TRANSCRIPT_LANGUAGE     ISO-639-1 language hint (default: en; set empty for autodetect)
#   YT_TRANSCRIPT_PROMPT       Optional vocabulary/context prompt for cloud ASR
#   YT_TRANSCRIPT_KEEP_AUDIO   Set to 1 to keep the compressed audio beside transcript
#   YT_TRANSCRIPT_VENV         Python venv containing yt-dlp + yt-dlp-getpot-wpc
#
# Secrets:
#   OPENAI_API_KEY is read from the environment only. Never put it in this file.

URL="${1:-}"
if [[ -z "$URL" ]]; then
  echo "Usage: yt-transcript <youtube-url>" >&2
  exit 2
fi

OUTDIR="${YT_TRANSCRIPT_OUTDIR:-$HOME/Téléchargements}"
MODEL="${YT_TRANSCRIPT_MODEL:-gpt-4o-mini-transcribe}"
LANGUAGE="${YT_TRANSCRIPT_LANGUAGE-en}"
ASR_PROMPT="${YT_TRANSCRIPT_PROMPT:-}"
KEEP_AUDIO="${YT_TRANSCRIPT_KEEP_AUDIO:-0}"
VENV="${YT_TRANSCRIPT_VENV:-$HOME/.venvs/yt-transcript}"
DENO="${DENO_BIN:-$HOME/.deno/bin/deno}"

mkdir -p "$OUTDIR"

if [[ -x "$VENV/bin/yt-dlp" ]]; then
  YTDLP="$VENV/bin/yt-dlp"
elif command -v yt-dlp >/dev/null 2>&1; then
  YTDLP="$(command -v yt-dlp)"
else
  echo "ERROR: yt-dlp not found. See patterns/youtube-transcript-workflow.md" >&2
  exit 1
fi

if [[ -x "$VENV/bin/python" ]]; then
  PYTHON="$VENV/bin/python"
else
  PYTHON="$(command -v python3 || true)"
fi

if [[ -z "$PYTHON" ]]; then
  echo "ERROR: python3 not found." >&2
  exit 1
fi

if [[ ! -x "$DENO" ]]; then
  if command -v deno >/dev/null 2>&1; then
    DENO="$(command -v deno)"
  else
    echo "ERROR: Deno not found. Current YouTube extraction needs a supported JS runtime." >&2
    echo "See patterns/youtube-transcript-workflow.md" >&2
    exit 1
  fi
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

COMMON=(
  --js-runtimes "deno:$DENO"
  --remote-components ejs:github
)

# Resolve metadata once so every output is stable and recognizable.
echo "Getting video information..."
META="$($YTDLP "${COMMON[@]}" --skip-download --print '%(id)s|||%(title)s' "$URL" | tail -n1)"
ID="${META%%|||*}"
TITLE="${META#*|||}"

if [[ -z "$ID" || "$META" == "$TITLE" ]]; then
  echo "ERROR: Could not resolve video ID/title." >&2
  exit 1
fi

SAFE_TITLE="$(printf '%s' "$TITLE" | sed 's#[/\\:*?"<>|]#_#g')"
BASE="$OUTDIR/$SAFE_TITLE [$ID]"

# ---------------------------------------------------------------------------
# Fast path: use existing YouTube captions/subtitles when present.
# ---------------------------------------------------------------------------
CAPDIR="$TMP/captions"
mkdir -p "$CAPDIR"

echo "Checking for YouTube captions..."
set +e
"$YTDLP" "${COMMON[@]}" \
  --skip-download \
  --write-subs \
  --write-auto-subs \
  --sub-langs 'en-orig,en,en.*' \
  --sub-format vtt \
  -o "$CAPDIR/%(id)s.%(ext)s" \
  "$URL" >/dev/null 2>"$TMP/captions.err"
CAP_STATUS=$?
set -e

CAPTION=""
for candidate in \
  "$CAPDIR/$ID.en-orig.vtt" \
  "$CAPDIR/$ID.en.vtt"
do
  if [[ -f "$candidate" ]]; then
    CAPTION="$candidate"
    break
  fi
done

if [[ -z "$CAPTION" ]]; then
  CAPTION="$(find "$CAPDIR" -maxdepth 1 -type f -name "$ID.en*.vtt" | sort | head -n1 || true)"
fi

if [[ -n "$CAPTION" && -f "$CAPTION" ]]; then
  cp "$CAPTION" "$BASE.vtt"

  "$PYTHON" - "$CAPTION" "$BASE.txt" <<'PY'
import html
import re
import sys
from pathlib import Path

src = Path(sys.argv[1])
dst = Path(sys.argv[2])

out = []
previous = None
for raw in src.read_text(encoding="utf-8", errors="replace").splitlines():
    line = raw.strip()
    if not line:
        continue
    if line == "WEBVTT" or line.startswith(("Kind:", "Language:", "NOTE", "STYLE", "REGION")):
        continue
    if "-->" in line:
        continue
    if re.fullmatch(r"\d+", line):
        continue
    line = re.sub(r"<[^>]+>", "", line)
    line = html.unescape(line).strip()
    if not line or line == previous:
        continue
    out.append(line)
    previous = line

dst.write_text("\n".join(out).strip() + "\n", encoding="utf-8")
PY

  echo
  echo "DONE (used existing YouTube captions; no transcription API call)."
  echo "Transcript: $BASE.txt"
  echo "Subtitles:  $BASE.vtt"
  exit 0
fi

if [[ $CAP_STATUS -ne 0 ]]; then
  echo "Caption retrieval did not produce a usable English track; falling back to audio transcription."
else
  echo "No usable English caption track found; falling back to audio transcription."
fi

# ---------------------------------------------------------------------------
# Audio download fallback.
# mweb currently needs a GVS PO token; yt-dlp-getpot-wpc supplies it via a
# Chrome/Chromium browser. If that path fails, web_embedded can work without
# the same token requirement for videos that permit embedding.
# ---------------------------------------------------------------------------
BROWSER="$(
  command -v google-chrome 2>/dev/null ||
  command -v google-chrome-stable 2>/dev/null ||
  command -v chromium 2>/dev/null ||
  command -v chromium-browser 2>/dev/null ||
  true
)"

AUDIO_TEMPLATE="$TMP/audio.%(ext)s"
download_ok=0

if [[ -n "$BROWSER" ]]; then
  echo "Downloading audio via mweb + PO-token provider..."
  set +e
  "$YTDLP" "${COMMON[@]}" \
    --extractor-args 'youtube:player_client=mweb' \
    --extractor-args "youtubepot-wpc:browser_path=$BROWSER" \
    -f 'bestaudio/best' \
    -o "$AUDIO_TEMPLATE" \
    "$URL"
  status=$?
  set -e
  if [[ $status -eq 0 ]]; then
    download_ok=1
  else
    rm -f "$TMP"/audio.* 2>/dev/null || true
  fi
fi

if [[ $download_ok -eq 0 ]]; then
  echo "Trying token-free web_embedded fallback..."
  "$YTDLP" "${COMMON[@]}" \
    --extractor-args 'youtube:player_client=web_embedded' \
    -f 'bestaudio/best' \
    -o "$AUDIO_TEMPLATE" \
    "$URL"
fi

AUDIO="$(find "$TMP" -maxdepth 1 -type f -name 'audio.*' ! -name '*.part' | head -n1 || true)"
if [[ -z "$AUDIO" || ! -f "$AUDIO" ]]; then
  echo "ERROR: Download command returned without a usable audio file." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Cloud transcription fallback.
# Compress speech before upload so long YouTube audio does not waste bandwidth.
# ---------------------------------------------------------------------------
if [[ -z "${OPENAI_API_KEY:-}" ]]; then
  echo "ERROR: This video has no usable captions and OPENAI_API_KEY is not set." >&2
  echo "Set the key in your shell, then rerun. Do not commit the key." >&2
  exit 1
fi

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ERROR: ffmpeg is required for the no-caption cloud-transcription fallback." >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required for the OpenAI transcription request." >&2
  exit 1
fi

echo "Compressing audio for speech recognition..."
COMPRESSED="$TMP/transcribe.m4a"
ffmpeg -hide_banner -loglevel error -y \
  -i "$AUDIO" \
  -vn -ac 1 -ar 16000 -c:a aac -b:a 32k \
  "$COMPRESSED"

if [[ "$KEEP_AUDIO" == "1" ]]; then
  cp "$COMPRESSED" "$BASE.m4a"
fi

# Keep each upload comfortably small. Most one-hour speech files at 32 kbps
# fit in one chunk; unusually long inputs are segmented automatically.
MAX_BYTES=23000000
SIZE="$(stat -c '%s' "$COMPRESSED")"
CHUNKS=()

if (( SIZE <= MAX_BYTES )); then
  CHUNKS+=("$COMPRESSED")
else
  echo "Long audio detected; splitting into 20-minute transcription chunks..."
  ffmpeg -hide_banner -loglevel error -y \
    -i "$COMPRESSED" \
    -c copy -f segment -segment_time 1200 -reset_timestamps 1 \
    "$TMP/chunk-%03d.m4a"
  while IFS= read -r chunk; do
    CHUNKS+=("$chunk")
  done < <(find "$TMP" -maxdepth 1 -type f -name 'chunk-*.m4a' | sort)
fi

if (( ${#CHUNKS[@]} == 0 )); then
  echo "ERROR: No transcription chunks were produced." >&2
  exit 1
fi

TRANSCRIPT="$BASE.txt"
: > "$TRANSCRIPT"

echo "Transcribing with $MODEL..."
for i in "${!CHUNKS[@]}"; do
  chunk="${CHUNKS[$i]}"
  response="$TMP/response-$i.json"

  CURL_ARGS=(
    -sS --fail-with-body
    https://api.openai.com/v1/audio/transcriptions
    -H "Authorization: Bearer $OPENAI_API_KEY"
    -F "file=@$chunk"
    -F "model=$MODEL"
  )

  if [[ -n "$LANGUAGE" ]]; then
    CURL_ARGS+=( -F "language=$LANGUAGE" )
  fi
  if [[ -n "$ASR_PROMPT" ]]; then
    CURL_ARGS+=( -F "prompt=$ASR_PROMPT" )
  fi

  if ! curl "${CURL_ARGS[@]}" > "$response"; then
    echo "ERROR: transcription API request failed for chunk $((i + 1))." >&2
    cat "$response" >&2 || true
    exit 1
  fi

  "$PYTHON" - "$response" "$TRANSCRIPT" <<'PY'
import json
import sys
from pathlib import Path

response_path = Path(sys.argv[1])
transcript_path = Path(sys.argv[2])

data = json.loads(response_path.read_text(encoding="utf-8"))
text = data.get("text")
if not isinstance(text, str) or not text.strip():
    raise SystemExit(f"No transcript text in API response: {data}")

with transcript_path.open("a", encoding="utf-8") as f:
    if transcript_path.stat().st_size:
        f.write("\n\n")
    f.write(text.strip())
    f.write("\n")
PY

done

echo
echo "DONE (cloud transcription fallback)."
echo "Transcript: $TRANSCRIPT"
if [[ "$KEEP_AUDIO" == "1" ]]; then
  echo "Audio:      $BASE.m4a"
fi
