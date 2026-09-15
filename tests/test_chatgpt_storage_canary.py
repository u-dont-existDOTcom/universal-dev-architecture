import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from tools.chatgpt_storage_canary import (
    CanaryStore,
    ConflictError,
    Handler,
    IntegrityError,
    Server,
    openapi_schema,
    run_self_test,
    sha256_hex,
)


class StorageCanaryTests(unittest.TestCase):
    def test_exact_utf8_round_trip_survives_store_restart(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            text = "  leading and trailing  \nΩ café 🧪\n\n"
            expected = sha256_hex(text.encode("utf-8"))
            first = CanaryStore(root).put(
                text=text,
                idempotency_key="restart-case",
                expected_sha256=expected,
            )
            loaded = CanaryStore(root).get(first.record_id)
            self.assertEqual(loaded["text"], text)
            self.assertEqual(loaded["sha256"], expected)
            self.assertEqual(loaded["byte_length"], len(text.encode("utf-8")))

    def test_same_idempotency_key_and_same_bytes_replays_same_record(self):
        with tempfile.TemporaryDirectory() as temp:
            store = CanaryStore(Path(temp))
            first = store.put(text="same", idempotency_key="same-key")
            second = store.put(text="same", idempotency_key="same-key")
            self.assertEqual(first.record_id, second.record_id)
            self.assertFalse(first.idempotent_replay)
            self.assertTrue(second.idempotent_replay)

    def test_idempotency_key_reuse_with_different_bytes_fails_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            store = CanaryStore(Path(temp))
            store.put(text="alpha", idempotency_key="reuse-key")
            with self.assertRaises(ConflictError):
                store.put(text="beta", idempotency_key="reuse-key")

    def test_expected_sha_mismatch_fails_before_storage(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            store = CanaryStore(root)
            with self.assertRaises(IntegrityError):
                store.put(text="alpha", idempotency_key="hash-mismatch", expected_sha256="0" * 64)
            self.assertEqual(list((root / "records").iterdir()), [])

    def test_tampered_record_fails_integrity_readback(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            store = CanaryStore(root)
            receipt = store.put(text="original", idempotency_key="tamper")
            record_path = root / "records" / f"{receipt.record_id}.json"
            payload = json.loads(record_path.read_text("utf-8"))
            payload["text_b64"] = "dGFtcGVyZWQ="
            record_path.write_text(json.dumps(payload), encoding="utf-8")
            with self.assertRaises(IntegrityError):
                store.get(receipt.record_id)

    def test_self_test_proves_write_replay_and_readback(self):
        with tempfile.TemporaryDirectory() as temp:
            result = run_self_test(Path(temp))
            self.assertEqual(result["status"], "pass")
            self.assertRegex(result["sha256"], r"^[a-f0-9]{64}$")

    def test_openapi_exposes_only_write_and_read_operations(self):
        schema = openapi_schema()
        self.assertEqual(
            set(schema["paths"]),
            {"/v1/records", "/v1/records/{record_id}"},
        )
        self.assertEqual(
            schema["paths"]["/v1/records"]["post"]["operationId"],
            "store_exact_text",
        )
        self.assertEqual(
            schema["paths"]["/v1/records/{record_id}"]["get"]["operationId"],
            "read_exact_text",
        )

    def test_http_surface_requires_auth_and_round_trips_exact_text(self):
        with tempfile.TemporaryDirectory() as temp:
            token = "test-token"
            server = Server(("127.0.0.1", 0), Handler, store=CanaryStore(Path(temp)), token=token)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            try:
                unauth = Request(
                    f"{base}/v1/records",
                    data=b'{"text":"x","idempotency_key":"unauth"}',
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with self.assertRaises(HTTPError) as ctx:
                    urlopen(unauth, timeout=3)
                self.assertEqual(ctx.exception.code, 401)

                text = " exact HTTP Ω \n"
                body = json.dumps(
                    {"text": text, "idempotency_key": "http-roundtrip"},
                    ensure_ascii=False,
                ).encode("utf-8")
                create = Request(
                    f"{base}/v1/records",
                    data=body,
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        "Authorization": f"Bearer {token}",
                    },
                    method="POST",
                )
                created = json.loads(urlopen(create, timeout=3).read().decode("utf-8"))
                read = Request(
                    f"{base}/v1/records/{created['record_id']}",
                    headers={"Authorization": f"Bearer {token}"},
                )
                loaded = json.loads(urlopen(read, timeout=3).read().decode("utf-8"))
                self.assertEqual(loaded["text"], text)
                self.assertEqual(loaded["sha256"], sha256_hex(text.encode("utf-8")))
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
