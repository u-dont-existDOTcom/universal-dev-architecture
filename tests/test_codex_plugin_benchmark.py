import json
import tempfile
import unittest
from pathlib import Path

from scripts.codex_plugin_benchmark.common import atomic_write_json, sha256_path
from scripts.codex_plugin_benchmark.inventory import collect_inventory


class HarnessFoundationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)

    def test_atomic_json_hash_is_stable_across_mapping_order(self):
        output = self.root / "record.json"

        atomic_write_json(output, {"b": 2, "a": 1})
        first = sha256_path(output)
        atomic_write_json(output, {"a": 1, "b": 2})

        self.assertEqual(first, sha256_path(output))
        self.assertEqual(output.read_text(encoding="utf-8"), '{\n  "a": 1,\n  "b": 2\n}\n')

    def test_inventory_reports_auth_mode_without_serializing_secrets(self):
        (self.root / "auth.json").write_text(
            json.dumps(
                {
                    "auth_mode": "chatgpt",
                    "tokens": {
                        "access_token": "benchmark-secret-access",
                        "refresh_token": "benchmark-secret-refresh",
                    },
                    "OPENAI_API_KEY": "benchmark-secret-api-key",
                }
            ),
            encoding="utf-8",
        )

        inventory = collect_inventory(self.root)
        encoded = json.dumps(inventory, sort_keys=True)

        self.assertEqual(inventory["auth"]["mode"], "configured-unread")
        self.assertEqual(inventory["auth"]["mode_source"], "auth-file-presence")
        self.assertFalse(inventory["auth"]["secret_values_read"])
        self.assertNotIn("benchmark-secret", encoded)

    def test_inventory_distinguishes_installed_plugin_and_skill_metadata(self):
        plugin = self.root / "plugins" / "cache" / "source" / "example" / "1.2.3"
        manifest = plugin / ".codex-plugin" / "plugin.json"
        manifest.parent.mkdir(parents=True)
        manifest.write_text(
            json.dumps(
                {
                    "name": "example-plugin",
                    "version": "1.2.3",
                    "description": "Example",
                    "skills": "./skills/",
                    "hooks": "./hooks/hooks.json",
                }
            ),
            encoding="utf-8",
        )
        (plugin / ".codex-remote-plugin-install.json").write_text(
            json.dumps({"plugin_id": "plugin_example"}), encoding="utf-8"
        )
        skill = plugin / "skills" / "example" / "SKILL.md"
        skill.parent.mkdir(parents=True)
        skill.write_text(
            "---\nname: example\ndescription: Exact example skill.\n---\n\n# Example\n",
            encoding="utf-8",
        )
        hooks = plugin / "hooks" / "hooks.json"
        hooks.parent.mkdir(parents=True)
        hooks.write_text(
            json.dumps({"hooks": {"Stop": [{"hooks": [{"type": "command", "command": "true"}]}]}}),
            encoding="utf-8",
        )

        inventory = collect_inventory(self.root)

        self.assertEqual(len(inventory["plugins"]), 1)
        self.assertEqual(inventory["plugins"][0]["name"], "example-plugin")
        self.assertEqual(inventory["plugins"][0]["install_state"], "installed")
        self.assertEqual(inventory["plugins"][0]["skills"][0]["name"], "example")
        self.assertEqual(inventory["plugins"][0]["hook_events"], ["Stop"])

    def test_inventory_redacts_dynamic_config_table_identifiers(self):
        private_path = "/home/example/secret-project-name"
        (self.root / "config.toml").write_text(
            f'model = "gpt-example"\n\n[projects."{private_path}"]\ntrust_level = "trusted"\n',
            encoding="utf-8",
        )

        inventory = collect_inventory(self.root)
        encoded = json.dumps(inventory, sort_keys=True)

        self.assertNotIn(private_path, encoded)
        self.assertEqual(inventory["config"]["tables"], ["projects.*"])


if __name__ == "__main__":
    unittest.main()
