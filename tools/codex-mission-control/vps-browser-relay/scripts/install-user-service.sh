#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
canonical_home="$(realpath -e -- "$HOME")"
install_parent="$HOME/.local/share/mission-control-chatgpt-relay"
install_root="$install_parent/app"
config_root="${MC_RELAY_CONFIG_ROOT:-$HOME/.config/mission-control-chatgpt-relay}"
state_root="${MC_RELAY_STATE_ROOT:-$HOME/.local/state/mission-control-chatgpt-relay}"
browser_profile_root="${MC_RELAY_BROWSER_PROFILE_DIR:-$HOME/.local/share/mission-control-chatgpt-profile}"
unit_root="$HOME/.config/systemd/user"

install -d -m 0700 "$install_parent" "$config_root" "$state_root" "$browser_profile_root" "$HOME/.cache" "$unit_root"
canonical_install_parent="$(realpath -e -- "$install_parent")"
expected_install_parent="$canonical_home/.local/share/mission-control-chatgpt-relay"
if [[ "$canonical_install_parent" != "$expected_install_parent" ]]; then
  echo "Install parent must be the non-symlinked dedicated Mission Control directory beneath HOME." >&2
  exit 64
fi

staging_root="$(mktemp -d "$install_parent/.install-new.XXXXXX")"
cp -a "$source_root"/. "$staging_root"/
chmod 0700 "$staging_root/bin/mc-chatgpt-relay.mjs" "$staging_root/bin/mc-submission-scheduler.mjs" "$staging_root/scripts/launch-browser.sh"

if [[ ! -f "$config_root/env" ]]; then
  install -m 0600 "$staging_root/.env.example" "$config_root/env"
fi
if [[ ! -f "$config_root/browser-env" ]]; then
  install -m 0600 "$staging_root/.browser.env.example" "$config_root/browser-env"
fi
if [[ ! -f "$config_root/chats.json" ]]; then
  install -m 0600 "$staging_root/chats.example.json" "$config_root/chats.json"
fi
if [[ ! -f "$config_root/active-lease.json" ]]; then
  install -m 0600 "$staging_root/active-lease.example.json" "$config_root/active-lease.json"
fi

for unit in mission-control-chatgpt.slice mission-control-chatgpt-browser.service mission-control-submission-scheduler.service mission-control-chatgpt-relay.service; do
  install -m 0644 "$staging_root/systemd/user/$unit" "$unit_root/$unit"
done

if [[ -e "$install_root" || -L "$install_root" ]]; then
  rollback_root="$install_parent/app.rollback.$(date -u +%Y%m%dT%H%M%SZ).$$"
  if [[ -e "$rollback_root" || -L "$rollback_root" ]]; then
    echo "Refusing to overwrite existing rollback path: $rollback_root" >&2
    exit 65
  fi
  mv -T -- "$install_root" "$rollback_root"
fi
if ! mv -T -- "$staging_root" "$install_root"; then
  if [[ -n "${rollback_root:-}" && ! -e "$install_root" && ! -L "$install_root" ]]; then
    mv -T -- "$rollback_root" "$install_root"
  fi
  exit 66
fi

systemctl --user daemon-reload

cat <<OUT
Installed Mission Control ChatGPT relay files.

Configuration:
  $config_root/env
  $config_root/browser-env
  $config_root/chats.json
  $config_root/active-lease.json

State:
  $state_root

Next executable steps:
  1. Edit env, browser-env, chats.json, and active-lease.json. Keep MC_RELAY_SUBMIT_ENABLED=0 initially.
  2. From the remote execution host's graphical desktop, run:
       systemctl --user stop mission-control-chatgpt-browser.service
       $install_root/scripts/launch-browser.sh
     Sign in to ChatGPT in that dedicated profile, open the registered chats, then close the browser.
  3. Start the primary scheduler and persistent browser. On a standby, keep the
     scheduler and relay disabled until controlled failover:
       systemctl --user enable --now mission-control-submission-scheduler.service
       systemctl --user enable --now mission-control-chatgpt-browser.service
  4. Validate without sending:
       set -a; source $config_root/env; set +a
       $install_root/bin/mc-chatgpt-relay.mjs doctor
       $install_root/bin/mc-chatgpt-relay.mjs once
  5. Set MC_RELAY_SUBMIT_ENABLED=1, then:
       systemctl --user enable --now mission-control-chatgpt-relay.service

For operation after logout/reboot, an administrator must enable user lingering once:
  sudo loginctl enable-linger "$USER"
OUT
