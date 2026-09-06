#!/usr/bin/env bash
set -euo pipefail

profile_dir="${MC_RELAY_BROWSER_PROFILE_DIR:-$HOME/.local/share/mission-control-chatgpt-profile}"
cdp_host="${MC_RELAY_CDP_HOST:-127.0.0.1}"
cdp_port="${MC_RELAY_CDP_PORT:-9222}"
display_value="${MC_RELAY_DISPLAY:-${DISPLAY:-}}"

if [[ "$cdp_host" != "127.0.0.1" && "$cdp_host" != "localhost" ]]; then
  echo "Refusing to expose Chrome DevTools outside loopback." >&2
  exit 64
fi

browser_bin="${MC_RELAY_BROWSER_BIN:-}"
if [[ -z "$browser_bin" ]]; then
  for candidate in brave-browser google-chrome-stable google-chrome chromium chromium-browser; do
    if command -v "$candidate" >/dev/null 2>&1; then
      browser_bin="$(command -v "$candidate")"
      break
    fi
  done
fi
if [[ -z "$browser_bin" || ! -x "$browser_bin" ]]; then
  echo "No supported Brave/Chrome/Chromium executable was found. Set MC_RELAY_BROWSER_BIN." >&2
  exit 69
fi

install -d -m 0700 "$profile_dir"

args=(
  "--user-data-dir=$profile_dir"
  "--remote-debugging-address=$cdp_host"
  "--remote-debugging-port=$cdp_port"
  "--no-first-run"
  "--no-default-browser-check"
  "--disable-background-mode"
  "--disable-session-crashed-bubble"
  "--disable-sync"
  "--disk-cache-size=268435456"
  "--media-cache-size=67108864"
  "about:blank"
)

if [[ -n "$display_value" ]]; then
  exec env DISPLAY="$display_value" "$browser_bin" "${args[@]}"
fi

if command -v xvfb-run >/dev/null 2>&1; then
  exec xvfb-run -a -s "-screen 0 1600x1000x24 -nolisten tcp" "$browser_bin" "${args[@]}"
fi

echo "No graphical DISPLAY and no xvfb-run are available. Initial ChatGPT login requires a graphical VPS session." >&2
exit 69
