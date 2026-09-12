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
# The central algorithm shim and its contract tests are repository-source-only.
# A deployed relay calls Mission Control's authenticated BFF and contains no
# local copy of the shared scheduler implementation.
rm -f -- \
  "$staging_root/src/submission-scheduler-service.mjs" \
  "$staging_root/test/submission-scheduler-service.test.mjs"
chmod 0700 "$staging_root/bin/mc-chatgpt-relay.mjs" "$staging_root/scripts/launch-browser.sh"

if [[ ! -f "$config_root/env" ]]; then
  install -m 0600 "$staging_root/.env.example" "$config_root/env"
fi
if [[ ! -f "$config_root/browser-env" ]]; then
  install -m 0600 "$staging_root/.browser.env.example" "$config_root/browser-env"
fi
if [[ ! -f "$config_root/chats.json" ]]; then
  install -m 0600 "$staging_root/chats.example.json" "$config_root/chats.json"
fi
for unit in mission-control-chatgpt.slice mission-control-chatgpt-browser.service mission-control-chatgpt-relay.service; do
  install -m 0644 "$staging_root/systemd/user/$unit" "$unit_root/$unit"
done

# PR #91 installed an independent host-local authority. If it exists, it must
# stop successfully before any replacement is installed; masking a stop
# failure could leave two live send authorities.
if systemctl --user cat mission-control-submission-scheduler.service >/dev/null 2>&1; then
  systemctl --user disable --now mission-control-submission-scheduler.service
fi
if systemctl --user is-active --quiet mission-control-submission-scheduler.service; then
  echo "Obsolete host-local scheduler is still active; refusing to continue." >&2
  exit 67
fi
rm -f -- "$unit_root/mission-control-submission-scheduler.service"

# Retire the obsolete scheduler-only configuration without printing it. Keep a
# recoverable owner-only copy outside the active configuration directory.
retired_config_root="$install_parent/retired-config"
if [[ -f "$config_root/active-lease.json" ]]; then
  install -d -m 0700 "$retired_config_root"
  mv -- "$config_root/active-lease.json" "$retired_config_root/active-lease.$(date -u +%Y%m%dT%H%M%SZ).$$.json"
fi
if grep -Eq '^MC_RELAY_SCHEDULER_(URL|TOKEN|TIMEOUT_MS)=' "$config_root/env"; then
  install -d -m 0700 "$retired_config_root"
  cp -p -- "$config_root/env" "$retired_config_root/env.before-shared-authority.$(date -u +%Y%m%dT%H%M%SZ).$$"
  sed -i -E '/^MC_RELAY_SCHEDULER_(URL|TOKEN|TIMEOUT_MS)=/d' "$config_root/env"
fi

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

Retired legacy scheduler configuration (when present):
  $retired_config_root

State:
  $state_root

Next executable steps:
  1. Edit env, browser-env, and chats.json. Keep MC_RELAY_SUBMIT_ENABLED=0 initially.
  2. From the remote execution host's graphical desktop, run:
       systemctl --user stop mission-control-chatgpt-browser.service
       $install_root/scripts/launch-browser.sh
     Sign in to ChatGPT in that dedicated profile, open the registered chats, then close the browser.
  3. Verify the one shared authority in Mission Control, then start the
     persistent browser. On a standby, keep the relay disabled until the
     Mission Control lease advances through controlled failover:
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
