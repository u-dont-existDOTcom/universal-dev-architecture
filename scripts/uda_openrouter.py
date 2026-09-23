#!/usr/bin/env python3
"""Call OpenRouter directly for provider/model capabilities unavailable through the UDA gateway."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
KEY_ENV = "OPENROUTER_API_KEY"
MODEL_ENV = "OPENROUTER_MODEL"


class OpenRouterError(RuntimeError):
    pass


def prompt_payload(prompt: str, model: str) -> dict[str, object]:
    if not prompt:
        raise ValueError("prompt must not be empty")
    if not model:
        raise ValueError("model must not be empty")
    return {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
    }


def load_request(path: str, model: str) -> dict[str, object]:
    raw = sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise ValueError("request JSON must be an object")
    if "model" not in value:
        if not model:
            raise ValueError("model is required when request JSON omits it")
        value["model"] = model
    return value


def load_prompt(path: str) -> str:
    return sys.stdin.read() if path == "-" else Path(path).read_text(encoding="utf-8")


def chat_completion(
    payload: dict[str, object],
    *,
    api_key: str | None = None,
    endpoint: str = DEFAULT_ENDPOINT,
    timeout: float = 120.0,
    opener=urllib.request.urlopen,
) -> dict[str, object]:
    resolved_key = (api_key if api_key is not None else os.environ.get(KEY_ENV, "")).strip()
    if not resolved_key:
        raise OpenRouterError(f"{KEY_ENV} is required")

    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {resolved_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/u-dont-existDOTcom/universal-dev-architecture",
            "X-Title": "UDA direct OpenRouter caller",
        },
        method="POST",
    )
    try:
        with opener(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        body = body.replace(resolved_key, "[REDACTED]")[:2000]
        raise OpenRouterError(f"OpenRouter HTTP {exc.code}: {body}") from exc
    except urllib.error.URLError as exc:
        raise OpenRouterError(f"OpenRouter transport error: {exc.reason}") from exc

    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise OpenRouterError("OpenRouter response was not valid JSON") from exc
    if not isinstance(value, dict):
        raise OpenRouterError("OpenRouter response JSON must be an object")
    return value


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--request-file", help="JSON request file, or - for stdin")
    source.add_argument("--prompt-file", help="Text prompt file, or - for stdin")
    parser.add_argument("--model", default=os.environ.get(MODEL_ENV, ""))
    parser.add_argument("--timeout", type=float, default=120.0)
    args = parser.parse_args()

    if args.request_file:
        payload = load_request(args.request_file, args.model)
    else:
        if not args.model:
            parser.error(f"--model or {MODEL_ENV} is required for --prompt-file")
        payload = prompt_payload(load_prompt(args.prompt_file), args.model)

    result = chat_completion(payload, timeout=args.timeout)
    json.dump(result, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
