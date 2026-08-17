# YouTube Transcript Workflow

## Purpose

Use this pattern when the owner asks to get, download, or generate a transcript/subtitles from a YouTube URL.

Canonical executable:

- `scripts/yt-transcript.sh`

Do not reconstruct this workflow from chat memory. Read the current script first because YouTube extraction behavior changes frequently.

## Decision order

1. **Prefer an existing YouTube subtitle/caption track.** This is fast and incurs no transcription API cost.
2. If the video exposes no usable English captions, **download audio with the current yt-dlp YouTube extraction stack**.
3. Avoid local Whisper on low-power laptops when speed matters. The validated local CPU path was impractically slow.
4. **Transcribe the downloaded audio in the cloud** with `gpt-4o-mini-transcribe` by default.
5. Keep secrets outside Git: `OPENAI_API_KEY` is an environment variable only.

The script implements that order automatically.

## Validated YouTube extraction topology (2026-08-17)

A video with no YouTube subtitles or automatic captions produced these successive failures with simpler approaches:

- ordinary `yt-dlp` audio request: HTTP 403 after extraction;
- `mweb` alone: GVS PO token missing, formats skipped, requested format unavailable;
- missing/undetected JS runtime: `n challenge solving failed`.

The path that worked was:

- current yt-dlp;
- Deno as the JS runtime;
- `--remote-components ejs:github` for the EJS challenge solver;
- `mweb` client plus `yt-dlp-getpot-wpc`, which mints the required PO token through Chrome/Chromium;
- `web_embedded` as a token-free fallback when embedding is permitted.

This is deliberately encoded as a fallback chain rather than a single brittle client flag.

## One-time setup on Ubuntu/Zorin

The owner's standard download location is `~/Téléchargements`.

Create/update the dedicated environment:

```bash
python3 -m venv ~/.venvs/yt-transcript
~/.venvs/yt-transcript/bin/pip install -U pip
~/.venvs/yt-transcript/bin/pip install -U 'yt-dlp[default]' yt-dlp-getpot-wpc
```

Install Deno if it is not already present:

```bash
curl -fsSL https://deno.land/install.sh | sh
```

System dependencies used by the fallback path:

```bash
sudo apt install -y ffmpeg curl
```

Chrome or Chromium must be available for the WPC PO-token provider. The script autodetects common executable names.

Set the API key in the shell or the user's secret-management mechanism, never in the repository:

```bash
export OPENAI_API_KEY='...'
```

## Normal use

From a checkout of this repository:

```bash
bash scripts/yt-transcript.sh 'https://www.youtube.com/watch?v=VIDEO_ID'
```

Or install/copy/symlink the script as `~/bin/yt-transcript` and use:

```bash
~/bin/yt-transcript 'https://www.youtube.com/watch?v=VIDEO_ID'
```

Default output:

- `~/Téléchargements/<title> [<video-id>].txt`
- plus `.vtt` when an existing YouTube caption track was used.

The audio is temporary by default. Set `YT_TRANSCRIPT_KEEP_AUDIO=1` to preserve the compressed `.m4a`.

## Cloud transcription behavior

Default model:

```text
gpt-4o-mini-transcribe
```

The OpenAI transcription endpoint accepts common audio containers including `m4a`, `webm`, and `ogg`. Supplying a two-letter language hint can improve accuracy and latency. The script defaults to English and permits overrides:

```bash
YT_TRANSCRIPT_LANGUAGE=fr bash scripts/yt-transcript.sh URL
```

For automatic language detection:

```bash
YT_TRANSCRIPT_LANGUAGE='' bash scripts/yt-transcript.sh URL
```

Optional vocabulary/context hint:

```bash
YT_TRANSCRIPT_PROMPT='Expect Buddhist Pali terminology and Senegalese place names.' \
  bash scripts/yt-transcript.sh URL
```

Long audio is compressed to mono 16 kHz AAC at a speech-oriented bitrate before upload. Inputs that remain large are split into bounded chunks automatically.

## Why not local Whisper by default

On the owner's Linux laptop, local faster-whisper CPU transcription was observed at roughly only a few words per second. It worked technically but was operationally poor for hour-scale videos. Cloud ASR is therefore the default fallback when YouTube has no captions.

Local ASR remains a valid privacy/offline option, but it should be an explicit tradeoff rather than the default recovery path.

## Failure diagnosis

### `There are no subtitles for the requested languages`

Run:

```bash
yt-dlp --remote-components ejs:github --list-subs URL
```

If yt-dlp reports both `has no automatic captions` and `has no subtitles`, stop trying subtitle flags and use the audio-transcription fallback.

### `HTTP Error 403: Forbidden` during audio download

Extraction can succeed while the actual media request is rejected. Do not interpret this as a Whisper/transcription failure. Verify the JS runtime and PO-token provider path.

### `n challenge solving failed`

Verify Deno is visible:

```bash
~/.deno/bin/deno --version
```

The script explicitly passes the Deno path to yt-dlp.

### `mweb ... require a GVS PO Token`

The PO-token provider did not load or was not usable. Verify the dedicated environment contains `yt-dlp-getpot-wpc` and Chrome/Chromium exists. Verbose yt-dlp output should enumerate a WPC PO-token provider when correctly loaded.

### Only images / requested format unavailable

This commonly follows a missing token or failed challenge solve. Fix those upstream conditions; do not randomly cycle format IDs.

## Security / durability rules

- Never commit `OPENAI_API_KEY`, cookies, browser profiles, or manually minted PO tokens.
- Prefer the dedicated venv so yt-dlp and its provider plugin upgrade together.
- YouTube anti-bot/challenge behavior is unstable. If this workflow breaks later, consult current yt-dlp documentation and update this pattern plus the script after validating the new path.
- Preserve the caption-first branch: it avoids needless API use whenever YouTube already provides text.

## Current upstream references

- yt-dlp EJS: `https://github.com/yt-dlp/yt-dlp/wiki/EJS`
- yt-dlp PO Token Guide: `https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide`
- WebPoClient provider: `https://github.com/coletdjnz/yt-dlp-getpot-wpc`
- OpenAI audio transcription API: `https://platform.openai.com/docs/api-reference/audio`

## Provenance

Promoted 2026-08-17 from a live Zorin/Ubuntu troubleshooting session. The decisive observed case was a YouTube video for which `--list-subs` confirmed no subtitles and no automatic captions; the mweb + PO-token/Deno path then restored audio download, while local Whisper proved too slow for practical use. The exact test URL is intentionally not required for reuse of this pattern.
