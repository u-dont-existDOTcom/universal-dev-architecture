import importlib.util
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "uda_openrouter", ROOT / "scripts" / "uda_openrouter.py"
)
client = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(client)


class FakeResponse:
    def __init__(self, value):
        self._body = json.dumps(value).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class UdaOpenRouterTests(unittest.TestCase):
    def test_prompt_payload_requires_model(self):
        self.assertEqual(
            client.prompt_payload("hello", "anthropic/claude-opus-5.5"),
            {
                "model": "anthropic/claude-opus-5.5",
                "messages": [{"role": "user", "content": "hello"}],
            },
        )
        with self.assertRaises(ValueError):
            client.prompt_payload("hello", "")

    def test_chat_completion_posts_directly_to_openrouter(self):
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["auth"] = request.get_header("Authorization")
            captured["referer"] = request.get_header("Http-referer")
            captured["title"] = request.get_header("X-title")
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse({"id": "reply", "choices": []})

        result = client.chat_completion(
            {"model": "anthropic/claude-opus-5.5", "messages": []},
            api_key="secret-key",
            timeout=3,
            opener=opener,
        )
        self.assertEqual(result["id"], "reply")
        self.assertEqual(captured["url"], client.DEFAULT_ENDPOINT)
        self.assertEqual(captured["auth"], "Bearer secret-key")
        self.assertEqual(captured["timeout"], 3)
        self.assertEqual(captured["body"]["model"], "anthropic/claude-opus-5.5")

    def test_provider_error_redacts_key(self):
        def opener(_request, timeout=None):
            raise urllib.error.HTTPError(
                client.DEFAULT_ENDPOINT,
                401,
                "unauthorized",
                {},
                io.BytesIO(b"provider echoed secret-key"),
            )

        with self.assertRaises(client.OpenRouterError) as ctx:
            client.chat_completion(
                {"model": "anthropic/claude-opus-5.5", "messages": []},
                api_key="secret-key",
                opener=opener,
            )
        self.assertNotIn("secret-key", str(ctx.exception))
        self.assertIn("[REDACTED]", str(ctx.exception))

    def test_request_file_defaults_model_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "request.json"
            path.write_text('{"messages":[]}', encoding="utf-8")
            value = client.load_request(str(path), "anthropic/claude-opus-5.5")
        self.assertEqual(value["model"], "anthropic/claude-opus-5.5")

    def test_missing_key_fails_closed(self):
        with self.assertRaises(client.OpenRouterError):
            client.chat_completion(
                {"model": "anthropic/claude-opus-5.5", "messages": []},
                api_key="",
            )


if __name__ == "__main__":
    unittest.main()
