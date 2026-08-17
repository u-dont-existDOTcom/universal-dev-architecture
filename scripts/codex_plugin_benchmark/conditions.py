from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

from .common import run_command, sha256_path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


REMOVED_PLUGINS = frozenset({"codex-process-jobs", "empire-llm-codex"})
CONTROLLED_REPOSITORY_INSTRUCTIONS = """# Benchmark repository working agreement

- Follow the task contract and keep changes narrowly scoped.
- Preserve existing public behavior unless the task explicitly changes it.
- Add or adjust tests for the requested behavior and run `npm test` before completion.
- Base completion claims on fresh command evidence and inspect the final diff.
"""
CONDITION_IDS = (
    "b0",
    "b1",
    "guardrails",
    "superpowers-engineering",
    "guardrails-plus-superpowers",
    "coordinator",
    "superpowers-coordination",
    "coordinator-plus-superpowers",
    "security",
    "security-full",
    "github",
    "maximum",
    "maximum-minus-guardrails",
    "maximum-minus-superpowers",
    "maximum-minus-coordinator",
    "maximum-minus-security",
    "maximum-minus-github",
    "minimal-finalist",
)

SUPERPOWERS_ENGINEERING = frozenset(
    {
        "using-superpowers",
        "brainstorming",
        "writing-plans",
        "test-driven-development",
        "systematic-debugging",
        "requesting-code-review",
        "receiving-code-review",
        "verification-before-completion",
        "finishing-a-development-branch",
    }
)
SUPERPOWERS_COORDINATION = frozenset(
    {
        "using-superpowers",
        "brainstorming",
        "writing-plans",
        "dispatching-parallel-agents",
        "subagent-driven-development",
        "executing-plans",
        "using-git-worktrees",
        "requesting-code-review",
        "verification-before-completion",
        "finishing-a-development-branch",
    }
)


@dataclass(frozen=True)
class SkillOverride:
    path: Path
    name: str
    plugin: str | None
    enabled: bool


@dataclass(frozen=True)
class ConditionRecord:
    condition_id: str
    label: str
    skill_overrides: tuple[SkillOverride, ...]
    enabled_skill_paths: tuple[Path, ...]
    features: dict[str, bool]
    project_doc_max_bytes: int
    repository_instruction_sha256: str | None
    residual_context_label: str
    content_sha256: str

    def to_dict(self) -> dict[str, object]:
        def public_path(path: Path) -> str:
            value = path.as_posix()
            marker = "/.codex/"
            return "${CODEX_AUDIT_ROOT}/" + value.split(marker, 1)[1] if marker in value else value

        inventory_root = REPOSITORY_ROOT / "audits" / "codex-plugin-stack" / "inventory"
        effective_stack = inventory_root / "effective-stack.json"
        runtime_surface = inventory_root / "runtime-tool-surface.json"
        return {
            "schema_version": 1,
            "condition_id": self.condition_id,
            "label": self.label,
            "skill_overrides": [
                {
                    "path": public_path(item.path),
                    "name": item.name,
                    "plugin": item.plugin,
                    "enabled": item.enabled,
                    "skill_sha256": sha256_path(item.path),
                }
                for item in self.skill_overrides
            ],
            "features": self.features,
            "project_doc_max_bytes": self.project_doc_max_bytes,
            "repository_instruction_sha256": self.repository_instruction_sha256,
            "residual_context_label": self.residual_context_label,
            "content_sha256": self.content_sha256,
            "content_hash_scope": "prompt routing: skill paths/enabled flags, feature flags, project-doc budget, and controlled repository-instruction hash",
            "effective_surface_evidence": {
                "effective_stack_sha256": (
                    sha256_path(effective_stack) if effective_stack.is_file() else None
                ),
                "runtime_tool_surface_sha256": (
                    sha256_path(runtime_surface) if runtime_surface.is_file() else None
                ),
            },
        }


def _frontmatter_name(path: Path) -> str:
    for line in path.read_text(encoding="utf-8").splitlines()[:20]:
        if line.startswith("name:"):
            return line.split(":", 1)[1].strip().strip("'\"")
    return path.parent.name


def _plugin_for_path(path: Path, codex_root: Path) -> str | None:
    try:
        relative = path.relative_to(codex_root)
    except ValueError:
        return None
    parts = relative.parts
    if len(parts) >= 7 and parts[:3] == ("plugins", "cache", parts[2]):
        # plugins/cache/<marketplace>/<plugin>/<version>/skills/<skill>/SKILL.md
        return parts[3]
    if parts and parts[0] == "skills":
        return "__system__" if len(parts) > 1 and parts[1] == ".system" else "__standalone__"
    return None


def discover_skills(codex_root: Path) -> tuple[tuple[Path, str, str | None], ...]:
    candidates = set((codex_root / "skills").glob("**/SKILL.md"))
    candidates.update((codex_root / "plugins" / "cache").glob("**/skills/*/SKILL.md"))
    return tuple(
        (path, _frontmatter_name(path), _plugin_for_path(path, codex_root))
        for path in sorted(candidates)
    )


def _selected(condition_id: str, name: str, plugin: str | None) -> bool:
    if plugin in REMOVED_PLUGINS:
        return False
    if condition_id in {"b0", "b1", "minimal-finalist"}:
        return False
    if condition_id == "guardrails":
        return plugin == "codex-engineering-guardrails"
    if condition_id == "superpowers-engineering":
        return plugin == "superpowers" and name in SUPERPOWERS_ENGINEERING
    if condition_id == "guardrails-plus-superpowers":
        return plugin == "codex-engineering-guardrails" or (
            plugin == "superpowers" and name in SUPERPOWERS_ENGINEERING
        )
    if condition_id == "coordinator":
        return plugin == "codex-coordinator"
    if condition_id == "superpowers-coordination":
        return plugin == "superpowers" and name in SUPERPOWERS_COORDINATION
    if condition_id == "coordinator-plus-superpowers":
        return plugin == "codex-coordinator" or (
            plugin == "superpowers" and name in SUPERPOWERS_COORDINATION
        )
    if condition_id in {"security", "security-full"}:
        return plugin == "codex-security"
    if condition_id == "github":
        return plugin == "github"
    if condition_id == "maximum":
        return True
    maximum_minus = {
        "maximum-minus-guardrails": "codex-engineering-guardrails",
        "maximum-minus-superpowers": "superpowers",
        "maximum-minus-coordinator": "codex-coordinator",
        "maximum-minus-security": "codex-security",
        "maximum-minus-github": "github",
    }
    if condition_id in maximum_minus:
        return plugin != maximum_minus[condition_id]
    raise ValueError(f"unknown condition: {condition_id}")


def build_condition(
    condition_id: str,
    trial_root: Path,
    codex_root: Path = Path.home() / ".codex",
) -> ConditionRecord:
    if condition_id not in CONDITION_IDS:
        raise ValueError(f"unknown condition: {condition_id}")
    discovered = discover_skills(codex_root)
    overrides = tuple(
        SkillOverride(path=path, name=name, plugin=plugin, enabled=_selected(condition_id, name, plugin))
        for path, name, plugin in discovered
    )
    skill_links = trial_root / ".agents" / "skills"
    repository_instruction_sha256: str | None = None
    if condition_id in {"b1", "minimal-finalist"}:
        repository_instructions = trial_root / "AGENTS.md"
        repository_instructions.write_text(CONTROLLED_REPOSITORY_INSTRUCTIONS, encoding="utf-8")
        repository_instruction_sha256 = hashlib.sha256(
            CONTROLLED_REPOSITORY_INSTRUCTIONS.encode("utf-8")
        ).hexdigest()
    for item in overrides:
        if not item.enabled or item.plugin in {None, "__standalone__", "__system__"}:
            continue
        skill_links.mkdir(parents=True, exist_ok=True)
        safe_plugin = item.plugin.replace(":", "-")
        safe_name = item.name.replace(":", "-")
        link = skill_links / f"{safe_plugin}--{safe_name}"
        if link.exists() or link.is_symlink():
            if link.resolve() != item.path.parent.resolve():
                raise FileExistsError(f"skill activation link has unexpected target: {link}")
        else:
            link.symlink_to(item.path.parent, target_is_directory=True)
    maximum_family = condition_id == "maximum" or condition_id.startswith("maximum-minus-")
    features = {
        "plugins": maximum_family or condition_id == "security-full",
        "apps": maximum_family,
        "hooks": maximum_family and condition_id != "maximum-minus-coordinator",
        "recommended_plugins": False,
        "browser_use": False,
        "browser_use_external": False,
        "computer_use": False,
        "in_app_browser": False,
    }
    project_doc_max_bytes = (
        32768 if condition_id in {"b1", "minimal-finalist"} or maximum_family else 0
    )
    labels = {
        "b0": "native Codex plus unavoidable system/developer instructions",
        "b1": "native Codex plus repository instructions",
        "guardrails": "native plus Engineering Guardrails",
        "superpowers-engineering": "native plus Superpowers engineering workflow",
        "guardrails-plus-superpowers": "native plus Guardrails and Superpowers engineering",
        "coordinator": "native plus Coordinator",
        "superpowers-coordination": "native plus Superpowers coordination",
        "coordinator-plus-superpowers": "native plus Coordinator and Superpowers coordination",
        "security": "native plus Codex Security skill surface",
        "security-full": "native plus Codex Security skills and plugin tool surface",
        "github": "native plus GitHub skill surface",
        "maximum": "maximum discovered stack excluding owner-removed Process Jobs",
        "maximum-minus-guardrails": "maximum skill surface minus Engineering Guardrails",
        "maximum-minus-superpowers": "maximum skill surface minus Superpowers",
        "maximum-minus-coordinator": "maximum skill surface minus Coordinator and lifecycle hooks",
        "maximum-minus-security": "maximum skill surface minus Codex Security skills",
        "maximum-minus-github": "maximum skill surface minus GitHub workflow skills",
        "minimal-finalist": "finalist minimal stack: native Codex plus repository instructions",
    }
    payload = {
        "condition_id": condition_id,
        "skills": [(str(item.path), item.enabled) for item in overrides],
        "features": features,
        "project_doc_max_bytes": project_doc_max_bytes,
    }
    if repository_instruction_sha256 is not None:
        payload["repository_instruction_sha256"] = repository_instruction_sha256
    content_sha256 = hashlib.sha256(
        json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    return ConditionRecord(
        condition_id=condition_id,
        label=labels[condition_id],
        skill_overrides=overrides,
        enabled_skill_paths=tuple(item.path.parent for item in overrides if item.enabled),
        features=features,
        project_doc_max_bytes=project_doc_max_bytes,
        repository_instruction_sha256=repository_instruction_sha256,
        residual_context_label=(
            "system and developer instructions remain outside per-run ablation controls"
        ),
        content_sha256=content_sha256,
    )


def _toml_skill_array(overrides: tuple[SkillOverride, ...]) -> str:
    items = []
    for item in overrides:
        path = json.dumps(str(item.path), ensure_ascii=False)
        enabled = "true" if item.enabled else "false"
        items.append(f"{{ path = {path}, enabled = {enabled} }}")
    return "[" + ", ".join(items) + "]"


def codex_overrides(record: ConditionRecord) -> list[str]:
    overrides: list[str] = []
    for feature, enabled in sorted(record.features.items()):
        overrides.extend(["-c", f"features.{feature}={'true' if enabled else 'false'}"])
    overrides.extend(["-c", f"project_doc_max_bytes={record.project_doc_max_bytes}"])
    overrides.extend(["-c", f"skills.config={_toml_skill_array(record.skill_overrides)}"])
    return overrides


def _text_blocks(value: object) -> list[str]:
    blocks: list[str] = []
    if isinstance(value, dict):
        for key, child in value.items():
            if key == "text" and isinstance(child, str):
                blocks.append(child)
            else:
                blocks.extend(_text_blocks(child))
    elif isinstance(value, list):
        for child in value:
            blocks.extend(_text_blocks(child))
    return blocks


def validate_prompt_surface(rendered: object, record: ConditionRecord) -> dict[str, object]:
    """Compare the rendered skill catalog with the exact condition manifest."""
    catalog_lines: list[str] = []
    for block in _text_blocks(rendered):
        if "<skills_instructions>" not in block:
            continue
        catalog_lines.extend(
            line
            for line in block.splitlines()
            if line.startswith("- ") and not line.startswith("- `")
        )
    enabled = {item.name for item in record.skill_overrides if item.enabled}
    disabled = {item.name for item in record.skill_overrides if not item.enabled}
    known = enabled | disabled
    exposed = {
        name
        for name in known
        if any(
            line.startswith(f"- {name}: ") or f":{name}: " in line
            for line in catalog_lines
        )
    }
    tolerated_unavailable = {
        item.name
        for item in record.skill_overrides
        if item.enabled and (item.plugin == "openai-templates" or item.name == "review-agent")
    }
    unavailable = sorted((enabled - exposed) & tolerated_unavailable)
    missing = sorted((enabled - exposed) - tolerated_unavailable)
    unexpected = sorted(disabled & exposed)
    unknown = sorted(
        line.removeprefix("- ").split(": ", 1)[0]
        for line in catalog_lines
        if not any(
            line.startswith(f"- {name}: ") or f":{name}: " in line
            for name in known
        )
    )
    return {
        "valid": not missing and not unexpected,
        "exposed_skills": sorted(exposed),
        "expected_enabled": sorted(enabled),
        "missing_enabled": missing,
        "unavailable_enabled": unavailable,
        "unexpected_disabled": unexpected,
        "unknown_exposed": unknown,
    }


def run_prompt_preflight(
    record: ConditionRecord,
    cwd: Path,
    *,
    codex_executable: str = "codex",
) -> dict[str, object]:
    command = [
        codex_executable,
        "debug",
        "prompt-input",
        *codex_overrides(record),
        "benchmark prompt-surface preflight",
    ]
    result = run_command(command, cwd, timeout_s=60)
    preflight: dict[str, object] = {
        "condition_id": record.condition_id,
        "condition_sha256": record.content_sha256,
        "command_exit_code": result.returncode,
        "wall_seconds": result.wall_seconds,
        "stderr": result.stderr[-4000:],
    }
    if result.returncode != 0:
        preflight.update({"valid": False, "parse_error": None})
        return preflight
    try:
        rendered = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        preflight.update({"valid": False, "parse_error": str(error)})
        return preflight
    validation = validate_prompt_surface(rendered, record)
    rendered_text = "\n".join(_text_blocks(rendered))
    repository_instructions_present = "# Benchmark repository working agreement" in rendered_text
    expected_repository_instructions = record.repository_instruction_sha256 is not None
    validation["repository_instructions_present"] = repository_instructions_present
    validation["expected_repository_instructions"] = expected_repository_instructions
    validation["valid"] = bool(validation["valid"]) and (
        repository_instructions_present == expected_repository_instructions
    )
    preflight.update(validation)
    preflight["rendered_prompt_sha256"] = hashlib.sha256(result.stdout.encode("utf-8")).hexdigest()
    return preflight
