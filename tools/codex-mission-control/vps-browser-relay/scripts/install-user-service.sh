#!/usr/bin/env bash
set -euo pipefail

source_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
install_root="${MC_RELAY_INSTALL_ROOT:-$HOME/.local/share/mission-control-chatgpt-relay/app}"
config_root="${MC_RELAY_CONFIG_ROOT:-$HOME/.config/mission-control-chatgpt-relay}"
state_root="${MC_RELAY_STATE_ROOT:-$HOME/.local/state/mission-control-chatgpt-relay}"
unit_root="$HOME/.config/systemd/user"

install -d -m 0700 "$install_root" "$config_root" "$state_root" "$unit_root"
rm -rf "$install_root"/*
cp -a "$source_root"/. "$install_root"/
chmod 0700 "$install_root/bin/mc-chatgpt-relay.mjs" "$install_root/scripts/launch-browser.sh"

if [[ ! -f "$config_root/env" ]]; then
  install -m 0600 "$source_root/.env.example" "$config_root/env"
fi
if [[ ! -f "$config_root/chats.json" ]]; then
  install -m 0600 "$source_root/chats.example.json" "$config_root/chats.json"
fi

for unit in mission-control-chatgpt.slice mission-control-chatgpt-browser.service mission-control-chatgpt-relay.service; do
  install -m 0644 "$source_root/systemd/user/$unit" "$unit_root/$unit"
done

systemctl --user daemon-reload

cat <<OUT
Installed Mission Control ChatGPT relay files.

Configuration:
  $config_root/env
  $config_root/chats.json

State:
  $state_root

Next executable steps:
  1. Edit env and chats.json. Keep MC_RELAY_SUBMIT_ENABLED=0 initially.
  2. From the Hostinger graphical desktop, run:
       systemctl --user stop mission-control-chatgpt-browser.service
       $install_root/scripts/launch-browser.sh
     Sign in to ChatGPT in that dedicated profile, open the registered chats, then close the browser.
  3. Start the persistent browser:
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
