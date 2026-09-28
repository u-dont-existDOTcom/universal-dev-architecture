#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <ssh-host>" >&2
  exit 64
fi

local_port="${MC_STATUS_LOCAL_PORT:-8787}"
remote_port="${MC_STATUS_PORT:-8787}"
printf 'Mission Control status: http://127.0.0.1:%s\n' "$local_port"
exec ssh -N -L "127.0.0.1:${local_port}:127.0.0.1:${remote_port}" "$1"
