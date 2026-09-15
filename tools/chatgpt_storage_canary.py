#!/usr/bin/env python3
"""Dependency-free exact-byte storage canary for ChatGPT app transport testing."""

from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import tempfile
import threading
from dataclasses import dataclass
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse

MAX_TEXT_BYTES = 128 * 1024
IDEMPOTENCY_RE = re.compile(r"^[A-Za-z0-9._:-]{1,200}$")
RECORD_ID_RE = re.compile(r"^rec_[a-f0-9]{32}$")


class CanaryError(Exception):
    status = HTTPStatus.BAD_REQUEST
    code = "canary_error"


class ConflictError(CanaryError):
    status = HTTPStatus.CONFLICT
    code = "conflict"


class IntegrityError(CanaryError):
    status = HTTPStatus.CONFLICT
    code = "integrity_error"


class NotFoundError(CanaryError):
    status = HTTPStatus.NOT_FOUND
    code = "not_found"


@dataclass(frozen=True)
class Receipt:
    record_id: str
    sha256: str
    byte_length: int
    idempotent_replay: bool

    def as_dict(self) -> dict[str, Any]:
        return {
            "record_id": self.record_id,
            "sha256": self.sha256,
            "byte_length": self.byte_length,
            "idempotent_replay": self.idempotent_replay,
        }


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def canonical_json_bytes(value: Any) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def fsync_dir(path: Path) -> None:
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        fsync_dir(path.parent)
    finally:
        if tmp.exists():
            tmp.unlink()


class CanaryStore:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.records = self.root / "records"
        self.keys = self.root / "idempotency"
        self.records.mkdir(parents=True, exist_ok=True)
        self.keys.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _key_path(self, key: str) -> Path:
        if not IDEMPOTENCY_RE.fullmatch(key):
            raise CanaryError("invalid idempotency_key")
        return self.keys / f"{sha256_hex(key.encode('utf-8'))}.json"

    def _record_path(self, record_id: str) -> Path:
        if not RECORD_ID_RE.fullmatch(record_id):
            raise NotFoundError("record not found")
        return self.records / f"{record_id}.json"

    def put(self, *, text: str, idempotency_key: str, expected_sha256: str | None = None) -> Receipt:
        if not isinstance(text, str):
            raise CanaryError("text must be a string")
        raw = text.encode("utf-8")
        if len(raw) > MAX_TEXT_BYTES:
            raise CanaryError(f"text exceeds {MAX_TEXT_BYTES} UTF-8 bytes")
        digest = sha256_hex(raw)
        if expected_sha256 is not None and not hmac.compare_digest(expected_sha256.lower(), digest):
            raise IntegrityError("expected_sha256 does not match exact UTF-8 bytes")

        key_path = self._key_path(idempotency_key)
        with self._lock:
            if key_path.exists():
                mapping = json.loads(key_path.read_text("utf-8"))
                if not hmac.compare_digest(mapping["sha256"], digest):
                    raise ConflictError("idempotency_key was already used for different bytes")
                record = self.get(mapping["record_id"])
                return Receipt(record["record_id"], record["sha256"], record["byte_length"], True)

            record_id = f"rec_{secrets.token_hex(16)}"
            payload = {
                "schema_version": 1,
                "record_id": record_id,
                "sha256": digest,
                "byte_length": len(raw),
                "text_b64": base64.b64encode(raw).decode("ascii"),
            }
            atomic_write(self._record_path(record_id), canonical_json_bytes(payload))
            atomic_write(
                key_path,
                canonical_json_bytes({"schema_version": 1, "record_id": record_id, "sha256": digest}),
            )
            return Receipt(record_id, digest, len(raw), False)

    def get(self, record_id: str) -> dict[str, Any]:
        path = self._record_path(record_id)
        if not path.exists():
            raise NotFoundError("record not found")
        payload = json.loads(path.read_text("utf-8"))
        raw = base64.b64decode(payload["text_b64"], validate=True)
        digest = sha256_hex(raw)
        if digest != payload["sha256"] or len(raw) != payload["byte_length"]:
            raise IntegrityError("stored record failed exact-byte integrity verification")
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise IntegrityError("stored bytes are not valid UTF-8") from exc
        return {
            "record_id": payload["record_id"],
            "sha256": digest,
            "byte_length": len(raw),
            "text": text,
        }


def openapi_schema() -> dict[str, Any]:
    return {
        "openapi": "3.1.0",
        "info": {"title": "Exact Byte Storage Canary", "version": "1.0.0"},
        "servers": [{"url": "https://REPLACE_WITH_CANARY_HOST"}],
        "components": {
            "securitySchemes": {
                "bearerAuth": {"type": "http", "scheme": "bearer"}
            }
        },
        "paths": {
            "/v1/records": {
                "post": {
                    "operationId": "store_exact_text",
                    "summary": "Store exact UTF-8 text and return its SHA-256 receipt.",
                    "security": [{"bearerAuth": []}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["text", "idempotency_key"],
                                    "properties": {
                                        "text": {"type": "string"},
                                        "idempotency_key": {"type": "string"},
                                        "expected_sha256": {"type": "string"},
                                    },
                                }
                            }
                        },
                    },
                    "responses": {"200": {"description": "Exact-byte receipt"}},
                }
            },
            "/v1/records/{record_id}": {
                "get": {
                    "operationId": "read_exact_text",
                    "summary": "Read exact stored UTF-8 text and verified SHA-256.",
                    "security": [{"bearerAuth": []}],
                    "parameters": [{"name": "record_id", "in": "path", "required": True, "schema": {"type": "string"}}],
                    "responses": {"200": {"description": "Verified stored record"}},
                }
            },
        },
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "StorageCanary/1.0"

    @property
    def store(self) -> CanaryStore:
        return self.server.store  # type: ignore[attr-defined]

    @property
    def token(self) -> str:
        return self.server.token  # type: ignore[attr-defined]

    def _json(self, status: int, payload: Any) -> None:
        body = canonical_json_bytes(payload)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _auth(self) -> bool:
        supplied = self.headers.get("Authorization", "")
        expected = f"Bearer {self.token}"
        if not self.token or not hmac.compare_digest(supplied, expected):
            self._json(HTTPStatus.UNAUTHORIZED, {"error": "unauthorized"})
            return False
        return True

    def _read_json(self) -> Any:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError as exc:
            raise CanaryError("invalid Content-Length") from exc
        if length <= 0 or length > MAX_TEXT_BYTES * 2:
            raise CanaryError("request body size is invalid")
        body = self.rfile.read(length)
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise CanaryError("request body must be UTF-8 JSON") from exc

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self._json(HTTPStatus.OK, {"status": "ok"})
            return
        if parsed.path == "/openapi.json":
            self._json(HTTPStatus.OK, openapi_schema())
            return
        if parsed.path.startswith("/v1/records/"):
            if not self._auth():
                return
            record_id = unquote(parsed.path.removeprefix("/v1/records/"))
            self._handle(lambda: self.store.get(record_id))
            return
        self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        if parsed.path != "/v1/records":
            self._json(HTTPStatus.NOT_FOUND, {"error": "not_found"})
            return
        if not self._auth():
            return
        self._handle(self._post_record)

    def _post_record(self) -> dict[str, Any]:
        payload = self._read_json()
        if not isinstance(payload, dict):
            raise CanaryError("request body must be an object")
        allowed = {"text", "idempotency_key", "expected_sha256"}
        if set(payload) - allowed:
            raise CanaryError("unexpected request fields")
        receipt = self.store.put(
            text=payload.get("text"),
            idempotency_key=payload.get("idempotency_key"),
            expected_sha256=payload.get("expected_sha256"),
        )
        return receipt.as_dict()

    def _handle(self, operation) -> None:
        try:
            self._json(HTTPStatus.OK, operation())
        except CanaryError as exc:
            self._json(exc.status, {"error": exc.code, "message": str(exc)})
        except Exception:
            self._json(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": "internal_error"})

    def log_message(self, fmt: str, *args: Any) -> None:
        # Never log request bodies or stored text.
        print(f"{self.address_string()} - {fmt % args}")


class Server(ThreadingHTTPServer):
    def __init__(self, address, handler, *, store: CanaryStore, token: str):
        super().__init__(address, handler)
        self.store = store
        self.token = token


def run_self_test(root: Path) -> dict[str, Any]:
    store = CanaryStore(root)
    text = "  storage-canary Ω\nline two\n"
    key = "self-test-v1"
    expected = sha256_hex(text.encode("utf-8"))
    first = store.put(text=text, idempotency_key=key, expected_sha256=expected)
    second = store.put(text=text, idempotency_key=key, expected_sha256=expected)
    loaded = store.get(first.record_id)
    if loaded["text"] != text or loaded["sha256"] != expected or not second.idempotent_replay:
        raise RuntimeError("self-test failed")
    return {"status": "pass", "record_id": first.record_id, "sha256": expected, "byte_length": len(text.encode('utf-8'))}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    serve.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8080")))
    serve.add_argument("--storage-dir", default=os.environ.get("CANARY_STORAGE_DIR", ".canary-data"))
    serve.add_argument("--token", default=os.environ.get("CANARY_TOKEN"))
    test = sub.add_parser("self-test")
    test.add_argument("--storage-dir", default=os.environ.get("CANARY_STORAGE_DIR"))
    args = parser.parse_args()

    if args.command == "self-test":
        if args.storage_dir:
            root = Path(args.storage_dir)
            root.mkdir(parents=True, exist_ok=True)
            print(json.dumps(run_self_test(root), sort_keys=True))
            return 0
        with tempfile.TemporaryDirectory(prefix="storage-canary-") as temp:
            print(json.dumps(run_self_test(Path(temp)), sort_keys=True))
            return 0

    if not args.token:
        parser.error("CANARY_TOKEN or --token is required to serve")
    store = CanaryStore(Path(args.storage_dir))
    server = Server((args.host, args.port), Handler, store=store, token=args.token)
    print(f"storage canary listening on {args.host}:{args.port}")
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
