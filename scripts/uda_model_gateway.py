#!/usr/bin/env python3
"""Call the configured UDA external-model gateway without exposing credentials."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

DEFAULT_MODEL = "gpt-5.6-sol"
URL_ENV = "UDA_MODEL_GATEWAY_URL"
TOKEN_ENV = "UDA_MODEL_GATEWAY_TOKEN"
MODEL_ENV = "UDA_MODEL_GATEWAY_MODEL"


class GatewayError(RuntimeError):
    pass


def gateway_endpoint(base_url: str) -> str:
    value = base_url.strip().rstrip("/")
    parsed = urlparse(value)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        raise ValueError("gateway URL must be an absolute http(s) URL")
    if parsed.scheme == "http" and parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise ValueError("non-loopback gateway URLs must use https")

    if parsed.query or parsed.fragment:
        raise ValueError("gateway URL must not contain a query or fragment")
    return f"{value}/v1/chat/completions"


def prompt_payload(prompt: str, model: str) -> dict[str, object]:
    if not prompt:
        raise ValueError("prompt must not be empty")
    return {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }


def load_request(path: str, model: str) -> dict[str, object]:
    raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("request JSON must be an object")
    value.setdefault("model", model)
    return value


def load_prompt(path: str) -> str:
    return sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")

def chat_completion(
    payload: dict[str, object],
    *,
    base_url: str | None = None,
    token: str | None = None,
    timeout: float = 60.0,
    opener=urllib.request.urlopen,
) -> dict[str, object]:
    resolved_url = (base_url or os.environ.get(URL_ENV, "")).strip()
    resolved_token = (token or os.environ.get(TOKEN_ENV, "")).strip()
    if not resolved_url:
        raise GatewayError(f"{URL_ENV} is required")
    if not resolved_token:
        raise GatewayError(f"{TOKEN_ENV} is required")

    request = urllib.request.Request(
        gateway_endpoint(resolved_url),
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {resolved_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        body = body.replace(resolved_token, "[REDACTED]")[:2000]
        raise GatewayError(f"gateway HTTP {exc.code}: {body}") from exc

    except urllib.error.URLError as exc:
        raise GatewayError(f"gateway transport error: {exc.reason}") from exc

    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise GatewayError("gateway response was not valid JSON") from exc
    if not isinstance(value, dict):
        raise GatewayError("gateway response JSON must be an object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--request-file", help="JSON request file, or - for stdin")
    source.add_argument("--prompt-file", help="Text prompt file, or - for stdin")
    parser.add_argument("--model", default=os.environ.get(MODEL_ENV, DEFAULT_MODEL))
    parser.add_argument("--timeout", type=float, default=60.0)
    args = parser.parse_args()

    payload = (
        load_request(args.request_file, args.model)
        if args.request_file
        else prompt_payload(load_prompt(args.prompt_file), args.model)
    )
    result = chat_completion(payload, timeout=args.timeout)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
