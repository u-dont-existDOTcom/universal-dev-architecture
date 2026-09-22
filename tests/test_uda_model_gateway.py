import importlib.util
import io
import json
import tempfile
import unittest
import urllib.error
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "uda_model_gateway", ROOT / "scripts" / "uda_model_gateway.py"
)
gateway = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(gateway)


class FakeResponse:
    def __init__(self, value):
        self._body = json.dumps(value).encode("utf-8")

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

class UdaModelGatewayTests(unittest.TestCase):
    def test_gateway_endpoint_requires_https_except_loopback(self):
        self.assertEqual(
            "https://gateway.example/v1/chat/completions",
            gateway.gateway_endpoint("https://gateway.example/"),
        )
        self.assertEqual(
            "http://127.0.0.1:3000/v1/chat/completions",
            gateway.gateway_endpoint("http://127.0.0.1:3000"),
        )
        with self.assertRaises(ValueError):
            gateway.gateway_endpoint("http://gateway.example")
        with self.assertRaises(ValueError):
            gateway.gateway_endpoint("https://gateway.example/?debug=1")

    def test_prompt_payload_uses_default_model_alias(self):
        self.assertEqual(
            gateway.prompt_payload("hello", gateway.DEFAULT_MODEL),
            {
                "model": "gpt-5.6-sol",
                "messages": [{"role": "user", "content": "hello"}],
            },
        )

    def test_chat_completion_uses_gateway_bearer_without_returning_it(self):
        captured = {}

        def opener(request, timeout):
            captured["url"] = request.full_url
            captured["auth"] = request.get_header("Authorization")
            captured["timeout"] = timeout
            captured["body"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse({"id": "reply", "choices": []})

        result = gateway.chat_completion(
            {"model": "gpt-5.6-sol", "messages": []},
            base_url="https://gateway.example",
            token="secret-token",
            timeout=3,
            opener=opener,
        )
        self.assertEqual(result["id"], "reply")
        self.assertEqual(captured["url"], "https://gateway.example/v1/chat/completions")
        self.assertEqual(captured["auth"], "Bearer secret-token")
        self.assertEqual(captured["timeout"], 3)
        self.assertEqual(captured["body"]["model"], "gpt-5.6-sol")

    def test_provider_error_redacts_gateway_token(self):
        def opener(_request, timeout=None):
            raise urllib.error.HTTPError(
                "https://gateway.example/v1/chat/completions",
                502,
                "bad gateway",
                {},
                io.BytesIO(b"upstream echoed secret-token"),
            )

        with self.assertRaises(gateway.GatewayError) as ctx:
            gateway.chat_completion(
                {"model": "gpt-5.6-sol", "messages": []},
                base_url="https://gateway.example",
                token="secret-token",
                opener=opener,
            )
        self.assertNotIn("secret-token", str(ctx.exception))
        self.assertIn("[REDACTED]", str(ctx.exception))

    def test_request_file_defaults_model_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "request.json"
            path.write_text('{"messages":[]}', encoding="utf-8")
            value = gateway.load_request(str(path), "gpt-5.6-sol")
        self.assertEqual(value["model"], "gpt-5.6-sol")


if __name__ == "__main__":
    unittest.main()
