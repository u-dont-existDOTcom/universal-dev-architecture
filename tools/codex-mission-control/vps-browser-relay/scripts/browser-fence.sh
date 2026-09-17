#!/usr/bin/env bash
set -euo pipefail

default_state_dir="/var/lib/mission-control-chatgpt/browser-fences"
state_dir="${MC_BROWSER_FENCE_STATE_DIR:-$default_state_dir}"
systemctl_bin="${MC_BROWSER_FENCE_SYSTEMCTL:-systemctl}"

command_name="${1:-}"
instance="${2:-}"
if [[ -z "$command_name" || -z "$instance" || "$instance" == -* || "$instance" == *[!a-zA-Z0-9_.-]* ]]; then
  echo "Usage: browser-fence.sh <engage|release|status|assert-unfenced> <instance>" >&2
  exit 64
fi
if [[ "$state_dir" != /* || "$state_dir" == "/" ]]; then
  echo "Browser fence state directory must be an absolute non-root path." >&2
  exit 64
fi

fence_file="$state_dir/$instance.fenced"
browser_unit="mission-control-chatgpt-browser@$instance.service"
relay_unit="mission-control-chatgpt-relay@$instance.service"
health_service="mission-control-chatgpt-health@$instance.service"
health_timer="mission-control-chatgpt-health@$instance.timer"

require_operator() {
  # Tests may use both an isolated state directory and a fake systemctl. The
  # real host path and real system manager always require root.
  if [[ "$EUID" -ne 0 && ( "$state_dir" == "$default_state_dir" || "$systemctl_bin" == "systemctl" ) ]]; then
    echo "Browser fence mutation requires root." >&2
    exit 77
  fi
}

case "$command_name" in
  assert-unfenced)
    if [[ -e "$fence_file" ]]; then
      echo "HOST_BROWSER_FENCED: $instance is fenced; release the takeover fence explicitly before browser startup." >&2
      exit 78
    fi
    ;;
  status)
    if [[ -e "$fence_file" ]]; then
      echo "HOST_BROWSER_FENCED"
    else
      echo "HOST_BROWSER_UNFENCED"
    fi
    ;;
  engage)
    require_operator
    install -d -m 0755 "$state_dir"
    pending_file="$(mktemp "$state_dir/.${instance}.fenced.XXXXXX")"
    cleanup() { rm -f -- "$pending_file"; }
    trap cleanup EXIT
    printf 'schema_version=1\ninstance=%s\nengaged_at=%s\nrelease_condition=controlled_takeover_complete_and_browser_explicitly_released\n' \
      "$instance" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" >"$pending_file"
    chmod 0644 "$pending_file"
    mv -f -- "$pending_file" "$fence_file"
    trap - EXIT

    "$systemctl_bin" stop "$relay_unit"
    "$systemctl_bin" disable --now "$health_timer"
    "$systemctl_bin" stop "$health_service"
    "$systemctl_bin" stop "$browser_unit"
    "$systemctl_bin" disable "$relay_unit" "$browser_unit"
    "$systemctl_bin" mask "$browser_unit"
    "$systemctl_bin" daemon-reload
    echo "HOST_BROWSER_FENCED"
    ;;
  release)
    require_operator
    "$systemctl_bin" unmask "$browser_unit"
    rm -f -- "$fence_file"
    "$systemctl_bin" daemon-reload
    echo "HOST_BROWSER_UNFENCED"
    ;;
  *)
    echo "Usage: browser-fence.sh <engage|release|status|assert-unfenced> <instance>" >&2
    exit 64
    ;;
esac
