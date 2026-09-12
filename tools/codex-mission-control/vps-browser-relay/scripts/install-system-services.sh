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

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
installed_app="$target_home/.local/share/mission-control-chatgpt-relay/app"
if [[ ! -x "$installed_app/scripts/launch-browser.sh" || ! -x "$installed_app/bin/mc-chatgpt-relay.mjs" ]]; then
  echo "The target user must install the exact relay package before system services are installed." >&2
  exit 69
fi

for unit in mission-control-chatgpt.slice mission-control-chatgpt-browser@.service mission-control-chatgpt-relay@.service; do
  install -m 0644 "$source_root/systemd/system/$unit" "/etc/systemd/system/$unit"
done
systemctl daemon-reload

cat <<OUT
Installed system-manager Mission Control browser and relay units for $target_user.

This compatibility mode permits only Chromium's SUID sandbox helper to perform
its required transition; the browser and relay remain unprivileged and retain
the other filesystem, kernel, resource, and namespace protections.

Start the browser without enabling sends:
  systemctl enable --now mission-control-chatgpt-browser@$target_user.service

After central authority checks pass and the host is active, start the relay:
  systemctl enable --now mission-control-chatgpt-relay@$target_user.service
OUT
