#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo "Run this installer as root after the target user has run install-user-service.sh." >&2
  exit 77
fi

target_user="${1:-}"
if [[ -z "$target_user" || "$target_user" == -* || "$target_user" == *[!a-zA-Z0-9_.-]* ]]; then
  echo "Usage: install-system-services.sh <existing-unprivileged-user>" >&2
  exit 64
fi
if ! target_record="$(getent passwd -- "$target_user")" || [[ -z "$target_record" ]]; then
  echo "Target user does not exist." >&2
  exit 67
fi
target_uid="$(id -u -- "$target_user")"
if [[ "$target_uid" -eq 0 ]]; then
  echo "Refusing to run the browser or relay as root." >&2
  exit 77
fi
target_home="$(printf '%s\n' "$target_record" | cut -d: -f6)"
if [[ -z "$target_home" || "$target_home" == "/" || ! -d "$target_home" ]]; then
  echo "Target user has no safe existing home directory." >&2
  exit 67
fi
if [[ "$target_home" != /* || "$target_home" == *[!a-zA-Z0-9_./-]* ]]; then
  echo "Target user home contains characters that cannot be safely pinned in a systemd unit." >&2
  exit 67
fi

node_bin="${MC_RELAY_NODE_BIN:-}"
if [[ -z "$node_bin" ]] && command -v node >/dev/null 2>&1; then
  node_bin="$(command -v node)"
fi
if [[ -z "$node_bin" ]]; then
  mapfile -t node_candidates < <(find "$target_home/.local/opt" -maxdepth 5 -type f -path '*/bin/node' -perm -0100 -print 2>/dev/null | sort -V)
  if [[ "${#node_candidates[@]}" -ne 1 ]]; then
    echo "Set MC_RELAY_NODE_BIN to one exact Node.js 22+ executable; automatic discovery was not unique." >&2
    exit 69
  fi
  node_bin="${node_candidates[0]}"
fi
node_bin="$(realpath -e -- "$node_bin")"
if [[ "$node_bin" != /* || "$node_bin" == *[!a-zA-Z0-9_./-]* || ! -x "$node_bin" ]]; then
  echo "Node.js executable path cannot be safely pinned in a systemd unit." >&2
  exit 69
fi
node_major="$(runuser -u "$target_user" -- "$node_bin" -p 'Number(process.versions.node.split(".")[0])')"
if [[ ! "$node_major" =~ ^[0-9]+$ || "$node_major" -lt 22 ]]; then
  echo "Mission Control relay requires Node.js 22 or later." >&2
  exit 69
fi

browser_env="$target_home/.config/mission-control-chatgpt-relay/browser-env"
if [[ ! -f "$browser_env" ]]; then
  echo "Browser-only environment file is missing." >&2
  exit 69
fi
mapfile -t browser_profile_assignments < <(grep -E '^MC_RELAY_BROWSER_PROFILE_DIR=' "$browser_env" || true)
if [[ "${#browser_profile_assignments[@]}" -gt 1 ]]; then
  echo "Browser profile must have at most one exact assignment." >&2
  exit 69
fi
browser_profile="$target_home/.local/share/mission-control-chatgpt-profile"
if [[ "${#browser_profile_assignments[@]}" -eq 1 ]]; then
  browser_profile="${browser_profile_assignments[0]#*=}"
fi
if [[ "$browser_profile" != /* || "$browser_profile" == *[!a-zA-Z0-9_./-]* || ! -d "$browser_profile" ]]; then
  echo "Browser profile path is missing or cannot be safely pinned in a systemd unit." >&2
  exit 69
fi
canonical_browser_profile="$(realpath -e -- "$browser_profile")"
if [[ "$canonical_browser_profile" != "$browser_profile" || "$browser_profile" != "$target_home/"* ]]; then
  echo "Browser profile must be a non-symlinked directory beneath the dedicated account home." >&2
  exit 69
fi

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
installed_app="$target_home/.local/share/mission-control-chatgpt-relay/app"
if [[ ! -x "$installed_app/scripts/launch-browser.sh" || ! -x "$installed_app/bin/mc-chatgpt-relay.mjs" ]]; then
  echo "The target user must install the exact relay package before system services are installed." >&2
  exit 69
fi

for unit in mission-control-chatgpt.slice mission-control-chatgpt-browser@.service mission-control-chatgpt-relay@.service; do
  install -m 0644 "$source_root/systemd/system/$unit" "/etc/systemd/system/$unit"
done

# In a system-manager unit, %h expands to the manager's home (/root), not to
# the home of User=%i. Pin the already-validated passwd home in an instance
# drop-in so the service cannot read another account's config or executable.
browser_dropin="/etc/systemd/system/mission-control-chatgpt-browser@${target_user}.service.d"
relay_dropin="/etc/systemd/system/mission-control-chatgpt-relay@${target_user}.service.d"
install -d -m 0755 "$browser_dropin" "$relay_dropin"

browser_override="$(mktemp "$browser_dropin/.home.conf.XXXXXX")"
relay_override="$(mktemp "$relay_dropin/.home.conf.XXXXXX")"
cleanup() {
  rm -f -- "$browser_override" "$relay_override"
}
trap cleanup EXIT

printf '%s\n' \
  '[Service]' \
  'EnvironmentFile=' \
  "EnvironmentFile=$target_home/.config/mission-control-chatgpt-relay/browser-env" \
  'ExecStart=' \
  "ExecStart=$target_home/.local/share/mission-control-chatgpt-relay/app/scripts/launch-browser.sh" \
  'ReadWritePaths=' \
  "ReadWritePaths=$browser_profile $target_home/.cache" \
  >"$browser_override"

printf '%s\n' \
  '[Service]' \
  'EnvironmentFile=' \
  "EnvironmentFile=$target_home/.config/mission-control-chatgpt-relay/env" \
  'ExecStart=' \
  "ExecStart=$node_bin $target_home/.local/share/mission-control-chatgpt-relay/app/bin/mc-chatgpt-relay.mjs run" \
  'ReadOnlyPaths=' \
  "ReadOnlyPaths=$target_home/.config/mission-control-chatgpt-relay" \
  'ReadWritePaths=' \
  "ReadWritePaths=$target_home/.local/state/mission-control-chatgpt-relay $target_home/.local/share/mission-control-chatgpt-profile" \
  >"$relay_override"

chmod 0644 "$browser_override" "$relay_override"
mv -f -- "$browser_override" "$browser_dropin/home.conf"
mv -f -- "$relay_override" "$relay_dropin/home.conf"
systemctl daemon-reload

cat <<OUT
Installed system-manager Mission Control browser and relay units for $target_user.

Pinned Node.js runtime:
  $node_bin (major $node_major)

Pinned dedicated browser profile:
  $browser_profile

This compatibility mode permits only Chromium's SUID sandbox helper to perform
its required transition; the browser and relay remain unprivileged and retain
the other filesystem, kernel, resource, and namespace protections.

Start the browser without enabling sends:
  systemctl enable --now mission-control-chatgpt-browser@$target_user.service

After central authority checks pass and the host is active, start the relay:
  systemctl enable --now mission-control-chatgpt-relay@$target_user.service
OUT
