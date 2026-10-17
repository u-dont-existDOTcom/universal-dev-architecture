#!/usr/bin/env bash
# Sets the passphrase Mission Control asks for on its "Register a task" page. Run it on the owner's own computer:
#   bash set-owner-task-passphrase.sh <ssh host> <container>
# where <ssh host> reaches the server and <container> is the live Mission Control container on it. The owner's deploy
# command runs the copy of this file from the merged commit, so what runs is what was reviewed.
#
# The owner types the passphrase here, twice. It never leaves this computer: only a scrypt verifier (a one-way hash of
# it) goes to the server, where scripts/set-owner-task-passphrase.ts installs it next to the database. The server's
# fingerprint of the verifier must match the one computed here; the registration form shows the same fingerprint.
# Nothing here prints or saves the passphrase or the verifier. Running it again replaces the passphrase.
set -uo pipefail
umask 077
HOST=${1:-}; CONTAINER=${2:-}
[[ "$HOST" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ && "$CONTAINER" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
  || { echo "usage: set-owner-task-passphrase.sh <ssh host> <container>"; exit 2; }
python3 -I -c 'import hashlib; hashlib.scrypt' 2>/dev/null \
  || { echo "This computer's python3 has no scrypt (hashlib.scrypt), which the passphrase needs. Nothing was changed."; exit 1; }
echo "Choose the passphrase you'll type on Mission Control's Register a task page. Type it only there; no chat will ask for it."
VERIFIER=$(python3 -I - <<'PY'
import base64, getpass, hashlib, os, sys, unicodedata
first = unicodedata.normalize("NFC", getpass.getpass("New registration passphrase (12+ characters; a few unrelated words work well): "))
if len(first) < 12:
    sys.exit("Too short: use 12 characters or more. Nothing was changed.")
if unicodedata.normalize("NFC", getpass.getpass("Type it again: ")) != first:
    sys.exit("The two didn't match. Nothing was changed.")
salt = os.urandom(16)
key = hashlib.scrypt(first.encode("utf-8"), salt=salt, n=2**16, r=8, p=2, maxmem=256 * 1024 * 1024, dklen=32)
b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
print(f"mc-task-passphrase:v1:scrypt:16:8:2:{b64(salt)}:{b64(key)}")
PY
) || exit 1
FINGERPRINT=$(printf '%s' "$VERIFIER" | python3 -I -c 'import hashlib, sys; print(hashlib.sha256(sys.stdin.read().strip().encode()).hexdigest()[:12])')
ERR=$(mktemp); trap 'rm -f "$ERR"' EXIT
OUT=$(printf '%s\n' "$VERIFIER" | ssh -o ClearAllForwardings=yes "$HOST" \
  "sudo -n docker exec -i $CONTAINER tsx scripts/set-owner-task-passphrase.ts" 2>"$ERR")
unset VERIFIER
if [ "$OUT" = "OWNER_TASK_PASSPHRASE_SET $FINGERPRINT" ]; then
  echo "PASSPHRASE SET. Fingerprint $FINGERPRINT; the Register a task page shows the same one."
elif [[ "$OUT" == OWNER_TASK_PASSPHRASE_SET* ]]; then
  echo "WRONG FINGERPRINT: the server installed a verifier with fingerprint ${OUT#OWNER_TASK_PASSPHRASE_SET }, not $FINGERPRINT."
  echo "Don't register a task until this is explained; run this again to replace it."
  exit 1
else
  tail -n 3 "$ERR"
  echo "NOT SET: the server didn't confirm this passphrase (reason above). Nothing else changed."
  exit 1
fi
