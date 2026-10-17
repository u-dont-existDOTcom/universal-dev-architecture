"""The owner's passphrase setup for Mission Control's Register a task page (PR #394).

deploy/set-owner-task-passphrase.sh runs on the owner's computer: it reads the passphrase twice from the terminal,
sends only a scrypt verifier to the server, and reports success only when the server echoes the verifier's own
fingerprint on standard output. These tests drive it through a pseudo-terminal with a stand-in for ssh.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import pty
import re
import shutil
import stat
import tempfile
import time
import unicodedata
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "tools/codex-mission-control/restored/codex-mission-control/deploy/set-owner-task-passphrase.sh"
VERIFIER = re.compile(r"^mc-task-passphrase:v1:scrypt:16:8:2:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$")

# The stand-in for ssh: records its arguments and the verifier it was sent, then answers as MODE says.
FAKE_SSH = r"""#!/usr/bin/env python3
import hashlib, json, os, sys
state = os.environ["FAKE_SSH_STATE"]
received = sys.stdin.read()
with open(state, "w") as handle:
    json.dump({"args": sys.argv[1:], "stdin": received}, handle)
mode = os.environ.get("FAKE_SSH_MODE", "ok")
fingerprint = hashlib.sha256(received.strip().encode()).hexdigest()[:12]
if mode == "fail":
    sys.stderr.write("sudo: a password is required\n")
    sys.exit(1)
if mode == "banner":
    sys.stderr.write("Welcome to the server\n")
if mode == "other":
    fingerprint = "0" * 12
print(f"OWNER_TASK_PASSPHRASE_SET {fingerprint}")
"""


def b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


class OwnerTaskPassphraseSetupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.directory = Path(tempfile.mkdtemp(prefix="mc-passphrase-setup-"))
        bin_dir = self.directory / "bin"
        bin_dir.mkdir()
        ssh = bin_dir / "ssh"
        ssh.write_text(FAKE_SSH)
        ssh.chmod(ssh.stat().st_mode | stat.S_IXUSR)
        self.state = self.directory / "ssh-state.json"
        self.env = dict(os.environ, PATH=f"{bin_dir}:{os.environ['PATH']}", FAKE_SSH_STATE=str(self.state))
        self.addCleanup(shutil.rmtree, self.directory, ignore_errors=True)

    def run_script(self, answers: list[str], mode: str = "ok", args: tuple[str, ...] = ("mc-host", "mc-live")) -> tuple[int, str]:
        env = dict(self.env, FAKE_SSH_MODE=mode)
        pid, fd = pty.fork()
        if pid == 0:
            os.execvpe("bash", ["bash", str(SCRIPT), *args], env)
        output = b""
        pending = list(answers)
        deadline = time.time() + 60
        while time.time() < deadline:
            try:
                chunk = os.read(fd, 1024)
            except OSError:
                break
            if not chunk:
                break
            output += chunk
            prompts = output.count(b"passphrase (12+") + output.count(b"Type it again")
            if pending and prompts > len(answers) - len(pending):
                os.write(fd, pending.pop(0).encode() + b"\n")
        _, status = os.waitpid(pid, 0)
        os.close(fd)
        return os.waitstatus_to_exitcode(status), output.decode(errors="replace").replace("\r", "")

    def test_sends_only_a_verifier_of_the_typed_passphrase_and_confirms_its_fingerprint(self) -> None:
        passphrase = "Café four unrelated words"
        code, output = self.run_script([passphrase, unicodedata.normalize("NFD", passphrase)], mode="banner")
        self.assertEqual(code, 0, output)
        state = json.loads(self.state.read_text())
        self.assertEqual(state["args"], ["-a", "-x", "-o", "ClearAllForwardings=yes", "mc-host",
                                         "sudo -n docker exec -i mc-live tsx scripts/set-owner-task-passphrase.ts"])
        line = state["stdin"].strip()
        match = VERIFIER.match(line)
        self.assertIsNotNone(match, line)
        salt, key = b64decode(match.group(1)), b64decode(match.group(2))
        expected = hashlib.scrypt(unicodedata.normalize("NFC", passphrase).encode(), salt=salt, n=2**16, r=8, p=2,
                                  maxmem=256 * 1024 * 1024, dklen=32)
        self.assertEqual(key, expected)
        fingerprint = hashlib.sha256(line.encode()).hexdigest()[:12]
        self.assertIn(f"PASSPHRASE SET. Fingerprint {fingerprint}", output)
        self.assertNotIn("Café", output)
        self.assertNotIn(line, output)
        self.assertNotIn("Welcome", output, "the server's stderr is not shown on success")

    def test_short_or_mismatched_passphrases_send_nothing(self) -> None:
        for answers, message in ((["too short"], "Too short"),
                                 (["first long passphrase", "second long passphrase"], "didn't match")):
            code, output = self.run_script(answers)
            self.assertEqual(code, 1, output)
            self.assertIn(message, output)
            self.assertFalse(self.state.exists(), "nothing reached the server")

    def test_a_failed_install_or_another_fingerprint_is_not_reported_as_set(self) -> None:
        code, output = self.run_script(["four unrelated words here", "four unrelated words here"], mode="fail")
        self.assertEqual(code, 1, output)
        self.assertIn("NOT SET", output)
        self.assertIn("a password is required", output)
        code, output = self.run_script(["four unrelated words here", "four unrelated words here"], mode="other")
        self.assertEqual(code, 1, output)
        self.assertIn("WRONG FINGERPRINT", output)
        self.assertNotIn("PASSPHRASE SET", output)

    def test_refuses_unsafe_host_or_container_names(self) -> None:
        for args in (("", "mc-live"), ("mc-host", "x; rm -rf /"), ("-oProxyCommand=evil", "mc-live")):
            code, output = self.run_script([], args=args)
            self.assertEqual(code, 2, output)
            self.assertFalse(self.state.exists())


if __name__ == "__main__":
    unittest.main()
