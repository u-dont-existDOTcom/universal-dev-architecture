#!/usr/bin/env python3
"""Validate Mission Control provenance JSON, schemas, templates, and fixtures."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import tempfile
from copy import deepcopy
from pathlib import Path
from typing import Any

try:
    from scripts.mission_control_provenance import (
        BROWSER_FAILURE_CODES,
        CLAIM_FAILURE_CODES,
        DurableReceiptConsumptionStore,
        ImmutableAuthoritySourceRegistry,
        ImmutableBrowserOwnershipRegistry,
        ImmutableClaimTransitionRegistry,
        ImmutableReproductionIndependenceRegistry,
        REASONING_FAILURE_CODES,
        _jcs_text,
        authority_source_digest,
        claim_digest,
        evaluate_claim_use,
        evaluate_browser_operation,
        evaluate_reasoning_surface_receipt,
        evaluate_reproduction,
        evaluate_subject_freshness,
        is_strict_rfc3339_datetime,
        admit_supervision_verdict,
        parse_all_json,
        reproduction_independence_admission_digest,
        validate_claim_record,
        validate_claim_transition,
        transition_digest,
    )
except ModuleNotFoundError:  # Direct script execution places scripts/ on sys.path.
    from mission_control_provenance import (
        BROWSER_FAILURE_CODES,
        CLAIM_FAILURE_CODES,
        DurableReceiptConsumptionStore,
        ImmutableAuthoritySourceRegistry,
        ImmutableBrowserOwnershipRegistry,
        ImmutableClaimTransitionRegistry,
        ImmutableReproductionIndependenceRegistry,
        REASONING_FAILURE_CODES,
        _jcs_text,
        authority_source_digest,
        claim_digest,
        evaluate_claim_use,
        evaluate_browser_operation,
        evaluate_reasoning_surface_receipt,
        evaluate_reproduction,
        evaluate_subject_freshness,
        is_strict_rfc3339_datetime,
        admit_supervision_verdict,
        parse_all_json,
        reproduction_independence_admission_digest,
        validate_claim_record,
        validate_claim_transition,
        transition_digest,
    )


class SchemaError(ValueError):
    """Raised when a template does not satisfy its checked JSON Schema."""


_PRO_EVIDENCE_EXTERNAL_ARTIFACT = {
    "repository": "u-dont-existDOTcom/humandesign",
    "commit": "bf8fa12bb133faa042e20a7408a0990aadf72eb6",
    "path": "state/PRO-META-REVIEW-2026-09-01.md",
    "artifactDigest": {
        "algorithm": "sha256",
        "value": "c10d68a4b28112f1cf17c2b4cd830ebac98823bf7e8ed2842d645c2461ff9139",
        "byteLength": 35743,
        "bytesDefinition": "exact Git blob content bytes at the bound commit and path",
    },
}
_PRO_EVIDENCE_EXTRACTION = {
    "algorithm": "UNIQUE_UTF8_MARKER_SUFFIX_V1",
    "marker": "## Complete response\n\n",
    "requiredMarkerOccurrences": 1,
    "startBoundary": "EXCLUSIVE_END_OF_MARKER",
    "endBoundary": "END_OF_ARTIFACT",
    "normalization": "NONE",
}
_PRO_EVIDENCE_RESPONSE = {
    "algorithm": "sha256",
    "value": "73abbb661ad2e6acf0caf13c4c425a33f283bf13d2c1dd3c404e97d48e9d6a2e",
    "byteLength": 33847,
    "bytesDefinition": "exact contiguous Git blob bytes strictly after the unique UTF-8 marker through end of artifact, with no normalization",
    "extraction": _PRO_EVIDENCE_EXTRACTION,
}


def extract_unique_marker_suffix(
    artifact_bytes: bytes, extraction: dict[str, Any]
) -> bytes:
    """Apply the only admitted response extraction algorithm byte-for-byte."""

    if extraction != _PRO_EVIDENCE_EXTRACTION:
        raise SchemaError("unsupported or altered Pro evidence extraction contract")
    marker = extraction["marker"].encode("utf-8")
    if artifact_bytes.count(marker) != extraction["requiredMarkerOccurrences"]:
        raise SchemaError("Pro evidence extraction marker is not unique")
    return artifact_bytes.split(marker, 1)[1]


def validate_sanitized_pro_evidence(
    receipt: dict[str, Any], *, artifact_bytes: bytes | None = None
) -> None:
    """Validate the public binding, and exact external bytes when supplied."""

    if receipt.get("externalArtifact") != _PRO_EVIDENCE_EXTERNAL_ARTIFACT:
        raise SchemaError(
            "sanitized Pro evidence is not bound to the existing Human Design artifact"
        )
    if receipt.get("completedResponseDigest") != _PRO_EVIDENCE_RESPONSE:
        raise SchemaError("sanitized Pro response extraction binding is incorrect")
    exclusions = receipt.get("privacyExclusions", [])
    if not {"RAW_CHAT_URL", "RAW_CONVERSATION_SESSION_ID"} <= set(exclusions):
        raise SchemaError("sanitized Pro evidence does not declare privacy exclusions")
    serialized = _jcs_text(receipt)
    if "chatgpt.com/c/" in serialized or "conversationSessionId" in serialized:
        raise SchemaError("sanitized Pro evidence contains excluded raw locator data")
    if artifact_bytes is None:
        return
    artifact_digest = receipt["externalArtifact"]["artifactDigest"]
    if (
        len(artifact_bytes) != artifact_digest["byteLength"]
        or hashlib.sha256(artifact_bytes).hexdigest() != artifact_digest["value"]
    ):
        raise SchemaError("external Human Design artifact bytes do not match receipt")
    response_bytes = extract_unique_marker_suffix(
        artifact_bytes, receipt["completedResponseDigest"]["extraction"]
    )
    response_digest = receipt["completedResponseDigest"]
    if (
        len(response_bytes) != response_digest["byteLength"]
        or hashlib.sha256(response_bytes).hexdigest() != response_digest["value"]
    ):
        raise SchemaError("extracted Pro response bytes do not match receipt")


def read_bound_external_artifact(repository: Path) -> bytes:
    result = subprocess.run(
        [
            "git",
            "-C",
            str(repository),
            "show",
            f"{_PRO_EVIDENCE_EXTERNAL_ARTIFACT['commit']}:{_PRO_EVIDENCE_EXTERNAL_ARTIFACT['path']}",
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if result.returncode != 0:
        raise SchemaError(
            "could not read bound Human Design evidence artifact: "
            + result.stderr.decode("utf-8", errors="replace").strip()
        )
    return result.stdout


def _types_match(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    raise SchemaError(f"unsupported schema type {expected}")


def _resolve_ref(root_schema: dict[str, Any], ref: str) -> Any:
    if not ref.startswith("#/"):
        raise SchemaError(f"only local JSON Pointer refs are supported: {ref}")
    current: Any = root_schema
    for raw_part in ref[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        current = current[part]
    return current


def validate_instance(
    instance: Any,
    schema: Any,
    *,
    root_schema: dict[str, Any],
    path: str = "$",
) -> None:
    """Validate the Draft 2020-12 subset used by this repository's templates."""

    if schema is True:
        return
    if schema is False:
        raise SchemaError(f"{path}: false schema")
    if "$ref" in schema:
        validate_instance(
            instance,
            _resolve_ref(root_schema, schema["$ref"]),
            root_schema=root_schema,
            path=path,
        )
        return
    if "not" in schema:
        try:
            validate_instance(
                instance,
                schema["not"],
                root_schema=root_schema,
                path=path,
            )
        except SchemaError:
            pass
        else:
            raise SchemaError(f"{path}: value matches forbidden schema")
    for branch in schema.get("allOf", []):
        validate_instance(instance, branch, root_schema=root_schema, path=path)
    if "if" in schema:
        try:
            validate_instance(instance, schema["if"], root_schema=root_schema, path=path)
        except SchemaError:
            branch = schema.get("else")
        else:
            branch = schema.get("then")
        if branch is not None:
            validate_instance(instance, branch, root_schema=root_schema, path=path)

    if "const" in schema and instance != schema["const"]:
        raise SchemaError(f"{path}: expected constant {schema['const']!r}")
    if "enum" in schema and instance not in schema["enum"]:
        raise SchemaError(f"{path}: {instance!r} not in enum")
    expected_type = schema.get("type")
    if expected_type is not None:
        expected_types = [expected_type] if isinstance(expected_type, str) else expected_type
        if not any(_types_match(instance, item) for item in expected_types):
            raise SchemaError(f"{path}: invalid type {type(instance).__name__}")

    if isinstance(instance, dict):
        for required in schema.get("required", []):
            if required not in instance:
                raise SchemaError(f"{path}: missing required property {required}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            unexpected = set(instance) - set(properties)
            if unexpected:
                raise SchemaError(f"{path}: unexpected properties {sorted(unexpected)}")
        for key, child in instance.items():
            if key in properties:
                validate_instance(
                    child,
                    properties[key],
                    root_schema=root_schema,
                    path=f"{path}.{key}",
                )
        if len(instance) < schema.get("minProperties", 0):
            raise SchemaError(f"{path}: too few properties")

    if isinstance(instance, list):
        if len(instance) < schema.get("minItems", 0):
            raise SchemaError(f"{path}: too few items")
        if schema.get("uniqueItems"):
            rendered = [_jcs_text(item) for item in instance]
            if len(rendered) != len(set(rendered)):
                raise SchemaError(f"{path}: duplicate array items")
        if "items" in schema:
            for index, item in enumerate(instance):
                validate_instance(
                    item,
                    schema["items"],
                    root_schema=root_schema,
                    path=f"{path}[{index}]",
                )

    if isinstance(instance, str):
        if len(instance) < schema.get("minLength", 0):
            raise SchemaError(f"{path}: string too short")
        if "pattern" in schema and re.search(schema["pattern"], instance) is None:
            raise SchemaError(f"{path}: string does not match {schema['pattern']}")
        if (
            schema.get("format") == "date-time"
            and not is_strict_rfc3339_datetime(instance)
        ):
            raise SchemaError(f"{path}: invalid strict RFC3339 date-time")
    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            raise SchemaError(f"{path}: value below minimum")


SCHEMA_TEMPLATE_PAIRS = {
    "authority-source-registry.schema.json": "AUTHORITY-SOURCE-REGISTRY.json",
    "browser-ownership-registry.schema.json": "BROWSER-OWNERSHIP-REGISTRY.json",
    "claim-transition-registry.schema.json": "CLAIM-TRANSITION-REGISTRY.json",
    "reproduction-independence-registry.schema.json": "REPRODUCTION-INDEPENDENCE-REGISTRY.json",
    "receipt-consumption-event.schema.json": "RECEIPT-CONSUMPTION-EVENT.json",
    "claim-record.schema.json": "CLAIM-RECORD.json",
    "claim-transition.schema.json": "CLAIM-TRANSITION.json",
    "claim-reproduction-receipt.schema.json": "CLAIM-REPRODUCTION-RECEIPT.json",
    "reasoning-surface-observation-receipt.schema.json": "REASONING-SURFACE-OBSERVATION-RECEIPT.json",
    "supervision-verdict-admission.schema.json": "SUPERVISION-VERDICT-ADMISSION.json",
    "browser-operation-receipt.schema.json": "BROWSER-OPERATION-RECEIPT.json",
}


_FIXTURE_INPUT = b"fixture source packet"
_FIXTURE_RESPONSE = b"fixture completed response"
_FIXTURE_ADMISSION_QUESTION = b"accept, revise, or reject this fixture packet"
_FIXTURE_ACCOUNT = "fixture-signed-in-account"
_FIXTURE_SUBJECT = "supervision-architecture/a40d413-authority-provenance-v1"
_FIXTURE_HEAD = "u-dont-existDOTcom/universal-dev-architecture@fixture-head"


def _source(
    source_ref: str,
    authority_class: str,
    operation: str,
    scope_ref: str,
) -> dict[str, Any]:
    source = {
        "authoritySourceRef": source_ref,
        "authorityClass": authority_class,
        "authorityScope": [operation],
        "scopeRefs": [scope_ref],
        "status": "CURRENT",
    }
    source["sourceRecordDigest"] = authority_source_digest(source)
    return source


def _registry(*sources: dict[str, Any]) -> ImmutableAuthoritySourceRegistry:
    return ImmutableAuthoritySourceRegistry.from_records(
        "fixture-authority-registry-v1", list(sources)
    )


def _fixture_claim(
    value: Any = 23,
    *,
    authorities: list[dict[str, Any]] | None = None,
    requirements: list[dict[str, Any]] | None = None,
    use_sites: list[str] | None = None,
    decision_use: str = "DESCRIPTIVE_ONLY",
    verification_state: str = "VERIFIED_FACT_ONLY",
) -> tuple[dict[str, Any], ImmutableAuthoritySourceRegistry]:
    source_records = authorities or [
        _source(
            "artifact-source-v1",
            "ARTIFACT_DERIVED_FACT",
            "ASSERT_FACT",
            "artifact-fact",
        )
    ]
    registry = _registry(*source_records)
    declared = [
        {key: deepcopy(value) for key, value in source.items() if key != "sourceRecordDigest"}
        for source in source_records
    ]
    claim = {
        "schemaVersion": 3,
        "claimId": "fixture-claim",
        "claimVersion": 1,
        "claimDigest": {
            "algorithm": "sha256",
            "canonicalization": "RFC8785_JCS",
            "digestScope": "CLAIM_SEMANTICS",
            "value": "0" * 64,
            "byteLength": 0,
        },
        "claimText": "Fixture claim",
        "claimValue": value,
        "claimKind": "SCIENTIFIC_CRITERION",
        "useSiteRefs": use_sites or [],
        "loadBearingEvaluation": {
            "rulesetVersion": "authority-provenance-v2",
            "result": bool(use_sites),
            "reasons": [],
        },
        "subjectRef": {
            "subjectType": "GIT_COMMIT",
            "repository": "owner/repository",
            "ref": "fixture-commit",
            "version": None,
            "digest": {"sha256": None},
        },
        "authorityRegistryRef": registry.registry_id,
        "authorityRegistryDigest": registry.registry_digest,
        "currentAuthorities": declared,
        "requiredAuthorizations": requirements
        if requirements is not None
        else [
            {
                "operation": "ASSERT_FACT",
                "requiredIssuerClass": "ARTIFACT_DERIVED_FACT",
                "scopeRef": "artifact-fact",
                "authorizationSourceRef": "artifact-source-v1",
                "status": "SATISFIED",
            }
        ],
        "evidenceRefs": ["artifact-source-v1"],
        "derivation": {"directiveVersion": "1.0.0"},
        "reproductionRequirement": "REQUIRED",
        "reproductionReceiptRefs": ["fixture-reproduction"],
        "verificationState": verification_state,
        "decisionUse": decision_use,
        "createdAt": "2026-09-01T00:00:00Z",
        "expiresAt": None,
        "supersedesClaimRef": None,
    }
    semantics = {key: value for key, value in claim.items() if key != "claimDigest"}
    claim["claimDigest"]["value"] = claim_digest(claim)
    claim["claimDigest"]["byteLength"] = len(
        _jcs_text(semantics).encode("utf-8")
    )
    return claim, registry


def _fixture_independence_registry() -> ImmutableReproductionIndependenceRegistry:
    admission = {
        "independenceAdmissionRef": "fixture-independence-admission",
        "producerEvidenceRef": "fixture-producer",
        "producer": {
            "identityRef": "fixture-production-process",
            "trustDomain": "fixture-production-domain",
        },
        "reproducer": {
            "identityRef": "fixture-independent-process",
            "type": "HUMAN_OR_INDEPENDENT_PROCESS",
            "trustDomain": "fixture-independent-domain",
        },
        "independenceBasis": "Separate fixture process",
        "admittedByRef": "fixture-relying-party-validator",
        "status": "ADMITTED",
        "admissionDigest": "0" * 64,
    }
    admission["admissionDigest"] = reproduction_independence_admission_digest(
        admission
    )
    return ImmutableReproductionIndependenceRegistry.from_records(
        "fixture-independence-registry-v1", [admission]
    )


def _fixture_reproduction(claim: dict[str, Any], *, synthetic: bool) -> dict[str, Any]:
    method = b"count exact production records"
    result = _jcs_text(claim["claimValue"]).encode("utf-8")
    independence_registry = _fixture_independence_registry()
    independence_admission = independence_registry.resolve(
        "fixture-independence-admission"
    )
    if independence_admission is None:
        raise SchemaError("fixture independence admission is missing")
    return {
        "schemaVersion": 1,
        "reproductionReceiptId": "fixture-reproduction",
        "claimRef": {
            "claimId": claim["claimId"],
            "claimVersion": claim["claimVersion"],
            "claimDigest": claim["claimDigest"]["value"],
        },
        "subjectRef": deepcopy(claim["subjectRef"]),
        "producerEvidenceRef": "fixture-producer",
        "independenceRegistryRef": independence_registry.registry_id,
        "independenceRegistryDigest": independence_registry.registry_digest,
        "independenceAdmissionRef": "fixture-independence-admission",
        "independenceAdmissionDigest": independence_admission["admissionDigest"],
        "reproducer": {
            "identityRef": "fixture-independent-process",
            "type": "HUMAN_OR_INDEPENDENT_PROCESS",
            "trustDomain": "fixture-independent-domain",
        },
        "independenceBasis": "Separate fixture process",
        "methodRef": "fixture-method",
        "methodDigest": hashlib.sha256(method).hexdigest(),
        "methodByteLength": len(method),
        "methodBytesDefinition": "exact method/procedure UTF-8 bytes",
        "commandOrProcedure": method.decode("utf-8"),
        "resultValue": claim["claimValue"],
        "resultDigest": hashlib.sha256(result).hexdigest(),
        "resultByteLength": len(result),
        "resultBytesDefinition": "RFC8785_JCS resultValue UTF-8 bytes",
        "matchState": "MATCH",
        "synthetic": synthetic,
        "reproducedAt": "2026-09-01T00:00:00Z",
        "freshnessState": "CURRENT",
        "promotesAuthority": False,
    }


def _fixture_transition_chain() -> tuple[
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    dict[str, Any],
    ImmutableAuthoritySourceRegistry,
    ImmutableClaimTransitionRegistry,
]:
    version_one, _ = _fixture_claim()
    version_two = deepcopy(version_one)
    version_two["claimVersion"] = 2
    version_two["supersedesClaimRef"] = "fixture-claim@1"
    version_two["claimDigest"]["value"] = claim_digest(version_two)
    version_two["claimDigest"]["byteLength"] = len(
        _jcs_text(
            {key: value for key, value in version_two.items() if key != "claimDigest"}
        ).encode("utf-8")
    )

    artifact = _source(
        "artifact-source-v1",
        "ARTIFACT_DERIVED_FACT",
        "ASSERT_FACT",
        "artifact-fact",
    )
    owner = _source(
        "owner-source-v1", "OWNER_EXPLICIT", "PROMOTE_TO_POLICY", "completion-policy"
    )
    registry = _registry(artifact, owner)
    version_three = deepcopy(version_two)
    version_three["claimVersion"] = 3
    version_three["claimKind"] = "OWNER_ACCEPTANCE_CRITERION"
    version_three["supersedesClaimRef"] = "fixture-claim@2"
    version_three["currentAuthorities"].append(
        {key: deepcopy(value) for key, value in owner.items() if key != "sourceRecordDigest"}
    )
    version_three["requiredAuthorizations"].append(
        {
            "operation": "PROMOTE_TO_POLICY",
            "requiredIssuerClass": "OWNER_EXPLICIT",
            "scopeRef": "completion-policy",
            "authorizationSourceRef": "owner-source-v1",
            "status": "SATISFIED",
        }
    )
    version_three["authorityRegistryRef"] = registry.registry_id
    version_three["authorityRegistryDigest"] = registry.registry_digest
    version_three["verificationState"] = "AUTHORIZED_POLICY"
    version_three["decisionUse"] = "POLICY_ELIGIBLE"
    version_three["claimDigest"]["value"] = claim_digest(version_three)
    version_three["claimDigest"]["byteLength"] = len(
        _jcs_text(
            {key: value for key, value in version_three.items() if key != "claimDigest"}
        ).encode("utf-8")
    )

    empty_registry = ImmutableClaimTransitionRegistry.from_records(
        "fixture-transition-registry-empty", "fixture-claim", []
    )

    def make_record(
        transition_id: str,
        from_claim: dict[str, Any],
        to_claim: dict[str, Any],
        transition_type: str,
        transition_registry: ImmutableClaimTransitionRegistry,
    ) -> dict[str, Any]:
        record = {
            "schemaVersion": 1,
            "transitionId": transition_id,
            "claimId": "fixture-claim",
            "fromClaimRef": {
                "claimId": "fixture-claim",
                "claimVersion": from_claim["claimVersion"],
                "claimDigest": from_claim["claimDigest"]["value"],
            },
            "toClaimRef": {
                "claimId": "fixture-claim",
                "claimVersion": to_claim["claimVersion"],
                "claimDigest": to_claim["claimDigest"]["value"],
            },
            "transitionType": transition_type,
            "requestedByRef": "owner-source-v1",
            "requiredAuthorizationRefs": ["completion-policy"],
            "authoritySourceRefs": ["owner-source-v1"],
            "evidenceRefs": [],
            "reason": "Fixture transition",
            "recordedAt": "2026-09-01T00:00:00Z",
            "previousTransitionDigest": transition_registry.head_transition_digest,
            "transitionRegistryRef": transition_registry.registry_id,
            "transitionRegistryDigest": transition_registry.registry_digest,
            "transitionDigest": "0" * 64,
            "status": "APPLIED",
        }
        record["transitionDigest"] = transition_digest(record)
        return record

    prior = make_record(
        "fixture-transition-1", version_one, version_two, "DERIVED", empty_registry
    )
    transition_registry = ImmutableClaimTransitionRegistry.from_records(
        "fixture-transition-registry-v1", "fixture-claim", [prior]
    )
    current = make_record(
        "fixture-transition-2",
        version_two,
        version_three,
        "PROMOTED",
        transition_registry,
    )
    return version_two, version_three, prior, current, registry, transition_registry


def _fixture_reasoning_receipt(root: Path) -> dict[str, Any]:
    receipt = json.loads(
        (root / "templates" / "REASONING-SURFACE-OBSERVATION-RECEIPT.json").read_text(
            encoding="utf-8"
        )
    )
    receipt.update(
        {
            "receiptId": "fixture-receipt",
            "transactionId": "fixture-transaction",
            "reviewRequirementId": "fixture-requirement",
            "scopeKey": _FIXTURE_SUBJECT,
            "packetId": "fixture-packet",
            "requiredReviewerRole": "PRO",
            "requiredAccountRef": _FIXTURE_ACCOUNT,
        }
    )
    receipt["observations"]["account"]["requiredValue"] = _FIXTURE_ACCOUNT
    receipt["subjectBinding"]["reviewSubjectRef"] = _FIXTURE_SUBJECT
    receipt["subjectBinding"]["boundRepositoryHeads"] = [_FIXTURE_HEAD]
    input_descriptor = {
        "value": hashlib.sha256(_FIXTURE_INPUT).hexdigest(),
        "byteLength": len(_FIXTURE_INPUT),
    }
    for name in ("sourcePacketDigest", "inputPayloadDigest", "submittedVisiblePayloadDigest"):
        receipt["subjectBinding"][name].update(input_descriptor)
    response_digest = hashlib.sha256(_FIXTURE_RESPONSE).hexdigest()
    receipt["responsePayloadDigest"].update(
        {"value": response_digest, "byteLength": len(_FIXTURE_RESPONSE)}
    )
    receipt["subjectBinding"]["admissionQuestionDigest"].update(
        {
            "value": hashlib.sha256(_FIXTURE_ADMISSION_QUESTION).hexdigest(),
            "byteLength": len(_FIXTURE_ADMISSION_QUESTION),
        }
    )
    receipt["conversation"]["conversationSessionId"] = "fixture-session"
    receipt["replayProtection"]["admissionNonce"] = "fixture-nonce"
    observed = {
        "surface": "SIGNED_IN_CHATGPT_CHAT",
        "account": receipt["observations"]["account"]["requiredValue"],
        "visibleModePreSubmission": "Pro",
        "conversationSession": "SAME_TRANSACTION_SESSION",
        "submittedMessage": "EXACT_BOUND_PAYLOAD",
        "completedResponse": response_digest,
        "visibleModePostResponse": "Pro",
    }
    for name, observation in receipt["observations"].items():
        observation.update(
            {
                "observedValue": observed[name],
                "status": "VERIFIED",
                "evidenceRef": f"fixture-ui-{name}",
                "evidenceSourceType": "BROWSER_UI_OBSERVATION",
                "observedAt": "2026-09-01T00:00:00Z",
                "binding": {
                    "transactionId": "fixture-transaction",
                    "conversationSessionId": "fixture-session",
                },
            }
        )
    receipt["aggregateState"] = "VERIFIED_COMPLETE"
    return receipt


def _fixture_reasoning_kwargs(store: DurableReceiptConsumptionStore) -> dict[str, Any]:
    return {
        "required_role": "PRO",
        "required_account_ref": _FIXTURE_ACCOUNT,
        "required_subject_ref": _FIXTURE_SUBJECT,
        "required_repository_head": _FIXTURE_HEAD,
        "input_payload_bytes": _FIXTURE_INPUT,
        "submitted_payload_bytes": _FIXTURE_INPUT,
        "payload_transform": None,
        "admission_question_bytes": _FIXTURE_ADMISSION_QUESTION,
        "response_payload_bytes": _FIXTURE_RESPONSE,
        "consumption_store": store,
    }


def _fixture_verdict(root: Path, receipt: dict[str, Any]) -> dict[str, Any]:
    verdict = json.loads(
        (root / "templates" / "SUPERVISION-VERDICT-ADMISSION.json").read_text(
            encoding="utf-8"
        )
    )
    verdict.update(
        {
            "verdictId": "fixture-verdict",
            "scopeKey": receipt["scopeKey"],
            "packetId": receipt["packetId"],
            "reviewRole": "PRO",
            "requiredAccountRef": _FIXTURE_ACCOUNT,
            "reasoningSurfaceReceiptRef": receipt["receiptId"],
            "boundSubjectRefs": [_FIXTURE_SUBJECT],
        }
    )
    verdict["responsePayloadDigest"] = deepcopy(receipt["responsePayloadDigest"])
    verdict["admissionQuestionDigest"] = deepcopy(
        receipt["subjectBinding"]["admissionQuestionDigest"]
    )
    return verdict


def _empty_browser_registry() -> ImmutableBrowserOwnershipRegistry:
    return ImmutableBrowserOwnershipRegistry.from_records(
        "fixture-browser-ownership-empty", []
    )


def _fixture_browser_receipt(root: Path) -> tuple[dict[str, Any], ImmutableBrowserOwnershipRegistry]:
    receipt = json.loads(
        (root / "templates" / "BROWSER-OPERATION-RECEIPT.json").read_text(
            encoding="utf-8"
        )
    )
    receipt.update(
        {
            "browserOperationId": "fixture-browser-operation",
            "transactionId": "fixture-browser-transaction",
            "taskId": "fixture-task",
            "packetId": "fixture-packet",
            "browserSessionRef": "fixture-browser-session",
        }
    )
    registry = _empty_browser_registry()
    receipt["priorOwnershipRegistryRef"] = registry.registry_id
    receipt["priorOwnershipRegistryDigest"] = registry.registry_digest
    return receipt, registry


def _browser_action(action_type: str, tab_id: str, result: str = "SUCCEEDED") -> dict[str, Any]:
    return {
        "type": action_type,
        "tabId": tab_id,
        "ownershipClass": "AGENT_OPENED",
        "protected": False,
        "browserSessionRef": "fixture-browser-session",
        "transactionId": "fixture-browser-transaction",
        "result": result,
        "closedByActor": "routing-executor" if action_type == "CLOSE" else None,
    }


def execute_hostile_scenario(
    root: Path,
    fixture_id: str,
    scenario: dict[str, Any],
    ledger_root: Path,
) -> dict[str, Any]:
    """Execute one fixture scenario through its real evaluator."""

    scenario_id = scenario["id"]
    if fixture_id == "claim-authority-provenance-hostile":
        if scenario_id == "reasoning-cannot-satisfy-owner-explicit":
            reasoning = _source("reasoning-v1", "REASONING_DECISION", "PROMOTE_TO_POLICY", "completion-policy")
            requirement = [{"operation": "PROMOTE_TO_POLICY", "requiredIssuerClass": "OWNER_EXPLICIT", "scopeRef": "completion-policy", "authorizationSourceRef": "reasoning-v1", "status": "SATISFIED"}]
            claim, registry = _fixture_claim(authorities=[reasoning], requirements=requirement, decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
            return evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=registry)
        if scenario_id in {"artifact-23-descriptive-only", "artifact-76-descriptive-only", "rename-cannot-promote"}:
            claim, registry = _fixture_claim(scenario.get("value", 23))
            if scenario_id == "rename-cannot-promote":
                claim["claimText"] = "completion_required_question_count"
                semantics = {key: value for key, value in claim.items() if key != "claimDigest"}
                claim["claimDigest"]["value"] = claim_digest(claim)
                claim["claimDigest"]["byteLength"] = len(_jcs_text(semantics).encode("utf-8"))
            return evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=registry)
        if scenario_id == "synthetic-reproduction-not-production":
            claim, _ = _fixture_claim()
            receipt = _fixture_reproduction(claim, synthetic=True)
            return evaluate_reproduction(
                receipt,
                claim,
                current_subject=deepcopy(claim["subjectRef"]),
                actual_method_bytes=b"count exact production records",
                actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
                independence_registry=_fixture_independence_registry(),
            )
        if scenario_id == "subject-commit-changed":
            claim, _ = _fixture_claim()
            changed = deepcopy(claim["subjectRef"])
            changed["ref"] = "changed-commit"
            result = evaluate_subject_freshness(claim, changed)
            return {"allowed": result["fresh"], "failureCodes": result["failureCodes"]}
        if scenario_id == "load-bearing-worker-false":
            claim, registry = _fixture_claim(use_sites=["OWNER_FACING_DEFINITIVE_RENDERING"])
            claim["loadBearingEvaluation"]["result"] = False
            semantics = {key: value for key, value in claim.items() if key != "claimDigest"}
            claim["claimDigest"]["value"] = claim_digest(claim)
            claim["claimDigest"]["byteLength"] = len(_jcs_text(semantics).encode("utf-8"))
            return evaluate_claim_use(claim, "ASSERT_FACT", authority_registry=registry, use_site="OWNER_FACING_DEFINITIVE_RENDERING")
        if scenario_id == "embedded-fake-authority-transition":
            owner = _source("owner-v1", "OWNER_EXPLICIT", "PROMOTE_TO_POLICY", "completion-policy")
            claim, _ = _fixture_claim(authorities=[owner], requirements=[{"operation": "PROMOTE_TO_POLICY", "requiredIssuerClass": "OWNER_EXPLICIT", "scopeRef": "completion-policy", "authorizationSourceRef": "owner-v1", "status": "SATISFIED"}], decision_use="POLICY_ELIGIBLE", verification_state="AUTHORIZED_POLICY")
            _, relying_registry = _fixture_claim()
            return evaluate_claim_use(claim, "PROMOTE_TO_POLICY", authority_registry=relying_registry, promotion_transition={"transitionType": "PROMOTED"})
        if scenario_id == "load-bearing-assert-zero-authorization":
            claim, registry = _fixture_claim(requirements=[], use_sites=["ACCEPTANCE_CRITERION"])
            return evaluate_claim_use(claim, "ASSERT_FACT", authority_registry=registry, use_site="ACCEPTANCE_CRITERION")
        if scenario_id in {"reproduction-result-bytes-tampered", "reproduction-receipt-unbound"}:
            claim, _ = _fixture_claim()
            receipt = _fixture_reproduction(claim, synthetic=False)
            if scenario_id == "reproduction-result-bytes-tampered":
                result_bytes = b"76"
            else:
                claim["reproductionReceiptRefs"] = []
                semantics = {key: value for key, value in claim.items() if key != "claimDigest"}
                claim["claimDigest"]["value"] = claim_digest(claim)
                claim["claimDigest"]["byteLength"] = len(_jcs_text(semantics).encode("utf-8"))
                receipt["claimRef"]["claimDigest"] = claim["claimDigest"]["value"]
                result_bytes = _jcs_text(claim["claimValue"]).encode("utf-8")
            return evaluate_reproduction(
                receipt,
                claim,
                current_subject=deepcopy(claim["subjectRef"]),
                actual_method_bytes=b"count exact production records",
                actual_result_bytes=result_bytes,
                independence_registry=_fixture_independence_registry(),
            )
        if scenario_id in {
            "transition-fabricated-prior",
            "transition-required-prior-missing",
            "complete-predecessor-not-in-trusted-registry",
        }:
            from_claim, to_claim, prior, current, registry, transition_registry = (
                _fixture_transition_chain()
            )
            if scenario_id in {
                "transition-fabricated-prior",
                "complete-predecessor-not-in-trusted-registry",
            }:
                fabricated = deepcopy(prior)
                fabricated["transitionId"] = "caller-fabricated-predecessor"
                fabricated["reason"] = "Caller-manufactured complete history"
                fabricated["transitionDigest"] = transition_digest(fabricated)
                current["previousTransitionDigest"] = fabricated["transitionDigest"]
            else:
                current["previousTransitionDigest"] = None
            current["transitionDigest"] = transition_digest(current)
            return validate_claim_transition(
                current,
                from_claim,
                to_claim,
                authority_registry=registry,
                transition_registry=transition_registry,
            )
        if scenario_id == "claim-use-predecessor-not-in-trusted-registry":
            from_claim, to_claim, prior, current, registry, transition_registry = (
                _fixture_transition_chain()
            )
            fabricated = deepcopy(prior)
            fabricated["transitionId"] = "caller-fabricated-claim-use-predecessor"
            fabricated["reason"] = "Caller-manufactured claim-use history"
            fabricated["transitionDigest"] = transition_digest(fabricated)
            current["previousTransitionDigest"] = fabricated["transitionDigest"]
            current["transitionDigest"] = transition_digest(current)
            return evaluate_claim_use(
                to_claim,
                "PROMOTE_TO_POLICY",
                authority_registry=registry,
                promotion_transition=current,
                transition_from_claim=from_claim,
                transition_registry=transition_registry,
            )
        if scenario_id == "reproduction-independence-missing":
            claim, _ = _fixture_claim()
            receipt = _fixture_reproduction(claim, synthetic=False)
            receipt["producerEvidenceRef"] = ""
            return evaluate_reproduction(
                receipt,
                claim,
                current_subject=deepcopy(claim["subjectRef"]),
                actual_method_bytes=b"count exact production records",
                actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
                independence_registry=_fixture_independence_registry(),
            )
        if scenario_id == "reproduction-self-asserted-same-process":
            claim, _ = _fixture_claim()
            receipt = _fixture_reproduction(claim, synthetic=False)
            receipt["reproducer"].update(
                {
                    "identityRef": "fixture-production-process",
                    "trustDomain": "fixture-production-domain",
                }
            )
            receipt["independenceBasis"] = (
                "not independent; same producer and process"
            )
            return evaluate_reproduction(
                receipt,
                claim,
                current_subject=deepcopy(claim["subjectRef"]),
                actual_method_bytes=b"count exact production records",
                actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
                independence_registry=_fixture_independence_registry(),
            )
        if scenario_id == "reproduction-independence-registry-tamper":
            claim, _ = _fixture_claim()
            receipt = _fixture_reproduction(claim, synthetic=False)
            receipt["independenceRegistryDigest"] = "f" * 64
            return evaluate_reproduction(
                receipt,
                claim,
                current_subject=deepcopy(claim["subjectRef"]),
                actual_method_bytes=b"count exact production records",
                actual_result_bytes=_jcs_text(claim["claimValue"]).encode("utf-8"),
                independence_registry=_fixture_independence_registry(),
            )
        if scenario_id == "unsealed-transition-registry-construction":
            from_claim, to_claim, _, current, registry, _ = (
                _fixture_transition_chain()
            )
            forged_digest = "a" * 64
            forged = object.__new__(ImmutableClaimTransitionRegistry)
            object.__setattr__(
                forged, "registry_id", "fixture-forged-transition-registry"
            )
            object.__setattr__(forged, "registry_digest", "b" * 64)
            object.__setattr__(forged, "claim_id", from_claim["claimId"])
            object.__setattr__(forged, "head_transition_digest", forged_digest)
            object.__setattr__(
                forged,
                "_records",
                {
                    forged_digest: _jcs_text(
                        {"toClaimRef": deepcopy(current["fromClaimRef"])}
                    )
                },
            )
            current["transitionRegistryRef"] = forged.registry_id
            current["transitionRegistryDigest"] = forged.registry_digest
            current["previousTransitionDigest"] = forged.head_transition_digest
            current["transitionDigest"] = transition_digest(current)
            return validate_claim_transition(
                current,
                from_claim,
                to_claim,
                authority_registry=registry,
                transition_registry=forged,
            )
        if scenario_id in {
            "transition-schema-invalid-calendar-date",
            "reproduction-schema-invalid-calendar-date",
        }:
            if scenario_id.startswith("transition-"):
                schema_name = "claim-transition.schema.json"
                template_name = "CLAIM-TRANSITION.json"
                timestamp_field = "recordedAt"
            else:
                schema_name = "claim-reproduction-receipt.schema.json"
                template_name = "CLAIM-REPRODUCTION-RECEIPT.json"
                timestamp_field = "reproducedAt"
            schema = json.loads(
                (root / "schemas" / schema_name).read_text(encoding="utf-8")
            )
            instance = json.loads(
                (root / "templates" / template_name).read_text(encoding="utf-8")
            )
            instance[timestamp_field] = "2026-02-30T00:00:00Z"
            try:
                validate_instance(instance, schema, root_schema=schema)
            except SchemaError:
                return {"allowed": False, "failureCodes": ["SCHEMA_REJECTED"]}
            return {"allowed": True, "failureCodes": []}

    if fixture_id == "reasoning-surface-receipt-hostile":
        receipt = _fixture_reasoning_receipt(root)
        store = DurableReceiptConsumptionStore(ledger_root / f"{scenario_id}.jsonl")
        kwargs = _fixture_reasoning_kwargs(store)
        if scenario_id in {"agent-name-extra-high", "model-self-description", "prompt-requested-mode"}:
            receipt["observations"]["visibleModePreSubmission"]["evidenceSourceType"] = scenario["evidenceSourceType"]
        elif scenario_id == "pro-plan-not-pro-mode":
            receipt["observations"]["visibleModePreSubmission"]["status"] = "MISSING"
            receipt["aggregateState"] = "PARTIAL"
        elif scenario_id == "pro-required-extra-high-observed":
            receipt["observations"]["visibleModePreSubmission"]["observedValue"] = "Extra High"
            receipt["observations"]["visibleModePostResponse"]["observedValue"] = "Extra High"
            receipt["aggregateState"] = "MISMATCH"
        elif scenario_id == "transplanted-session":
            receipt["observations"]["completedResponse"]["binding"]["conversationSessionId"] = "other-session"
            receipt["aggregateState"] = "MISMATCH"
        elif scenario_id == "receipt-replay":
            verdict = _fixture_verdict(root, receipt)
            admitted = admit_supervision_verdict(verdict, receipt, **kwargs)
            if not admitted["admitted"]:
                raise SchemaError("fixture setup could not consume receipt")
        elif scenario_id == "unexplained-payload-transform":
            receipt["subjectBinding"]["submittedVisiblePayloadDigest"]["value"] = "2" * 64
            receipt["aggregateState"] = "MISMATCH"
        elif scenario_id == "response-verdict-digest-mismatch":
            verdict = _fixture_verdict(root, receipt)
            verdict["responsePayloadDigest"]["value"] = "2" * 64
            return admit_supervision_verdict(verdict, receipt, **kwargs)
        elif scenario_id == "platform-attestation-overclaim":
            receipt["cryptographicPlatformAttestation"] = True
            receipt["aggregateState"] = "PARTIAL"
        elif scenario_id == "receipt-self-selects-role":
            receipt["requiredReviewerRole"] = "EXTRA_HIGH"
            for name in ("visibleModePreSubmission", "visibleModePostResponse"):
                receipt["observations"][name].update({"requiredValue": "Extra High", "observedValue": "Extra High"})
        elif scenario_id == "external-subject-mismatch":
            receipt["subjectBinding"]["reviewSubjectRef"] = "self-selected-subject"
        elif scenario_id == "external-repository-head-mismatch":
            receipt["subjectBinding"]["boundRepositoryHeads"] = ["owner/repository@self-selected"]
        elif scenario_id == "external-input-bytes-mismatch":
            kwargs["input_payload_bytes"] = b"different input"
        elif scenario_id == "external-response-bytes-mismatch":
            kwargs["response_payload_bytes"] = b"different response"
        elif scenario_id == "admission-question-receipt-tampered":
            receipt["subjectBinding"]["admissionQuestionDigest"].update(
                {"value": "f" * 64, "byteLength": 999999}
            )
        elif scenario_id == "admission-question-verdict-tampered":
            verdict = _fixture_verdict(root, receipt)
            verdict["admissionQuestionDigest"].update(
                {"value": "f" * 64, "byteLength": 999999}
            )
            return admit_supervision_verdict(verdict, receipt, **kwargs)
        elif scenario_id == "declared-transform-unreproduced":
            submitted = b"magic"
            receipt["subjectBinding"]["submittedVisiblePayloadDigest"].update(
                {
                    "value": hashlib.sha256(submitted).hexdigest(),
                    "byteLength": len(submitted),
                }
            )
            receipt["subjectBinding"]["submissionTransform"] = {
                "type": "DECLARED_REPRODUCIBLE_TRANSFORM",
                "transformRef": "magic-transform",
                "description": "magic",
                "transformDigest": hashlib.sha256(submitted).hexdigest(),
                "transformSpecByteLength": len(submitted),
                "transformSpecBytesDefinition": "caller-selected opaque bytes",
            }
            kwargs["submitted_payload_bytes"] = submitted
        elif scenario_id == "verified-observation-empty-evidence-ref":
            receipt["observations"]["account"]["evidenceRef"] = ""
        elif scenario_id == "verified-observation-invalid-observed-at":
            receipt["observations"]["completedResponse"]["observedAt"] = "not-a-time"
        elif scenario_id == "verified-observation-week-date":
            receipt["observations"]["completedResponse"]["observedAt"] = (
                "2026-W36-2T00:00:00+00:00"
            )
        elif scenario_id == "verified-observation-ordinal-date":
            receipt["observations"]["completedResponse"]["observedAt"] = (
                "2026-244T00:00:00+00:00"
            )
        elif scenario_id == "verified-observation-space-date":
            receipt["observations"]["completedResponse"]["observedAt"] = (
                "2026-09-01 00:00:00+00:00"
            )
        elif scenario_id == "anonymous-account-self-selected":
            receipt["requiredAccountRef"] = "ANONYMOUS_OR_UNKNOWN"
            receipt["observations"]["account"].update(
                {
                    "requiredValue": "ANONYMOUS_OR_UNKNOWN",
                    "observedValue": "ANONYMOUS_OR_UNKNOWN",
                }
            )
        elif scenario_id == "verdict-account-mismatch":
            verdict = _fixture_verdict(root, receipt)
            verdict["requiredAccountRef"] = "some-other-signed-in-account"
            return admit_supervision_verdict(verdict, receipt, **kwargs)
        elif scenario_id == "payload-transform-lookalike-override":
            submitted = b"unrelated-submitted-bytes"
            spec_bytes = _jcs_text(
                {"type": "UTF8_APPEND_LITERAL_V1", "suffixUtf8": "\nreview"}
            ).encode("utf-8")

            class ForgedPayloadTransform:
                transform_ref = "fixture-lookalike-transform"
                description = (
                    "append the exact UTF-8 suffix declared by "
                    "UTF8_APPEND_LITERAL_V1"
                )
                transform_digest = hashlib.sha256(spec_bytes).hexdigest()
                spec_byte_length = len(spec_bytes)
                spec_bytes_definition = (
                    "canonical UTF-8 JSON declarative transform specification bytes"
                )

                @staticmethod
                def apply(value: bytes) -> bytes:
                    return submitted

            receipt["subjectBinding"]["submittedVisiblePayloadDigest"].update(
                {
                    "value": hashlib.sha256(submitted).hexdigest(),
                    "byteLength": len(submitted),
                }
            )
            forged = ForgedPayloadTransform()
            receipt["subjectBinding"]["submissionTransform"] = {
                "type": "DECLARED_REPRODUCIBLE_TRANSFORM",
                "transformRef": forged.transform_ref,
                "description": forged.description,
                "transformDigest": forged.transform_digest,
                "transformSpecByteLength": forged.spec_byte_length,
                "transformSpecBytesDefinition": forged.spec_bytes_definition,
            }
            kwargs["submitted_payload_bytes"] = submitted
            kwargs["payload_transform"] = forged
        elif scenario_id == "observation-schema-invalid-calendar-date":
            schema = json.loads(
                (
                    root
                    / "schemas"
                    / "reasoning-surface-observation-receipt.schema.json"
                ).read_text(encoding="utf-8")
            )
            receipt["observations"]["surface"].update(
                {
                    "status": "VERIFIED",
                    "evidenceRef": "fixture-ui-surface",
                    "evidenceSourceType": "BROWSER_UI_OBSERVATION",
                    "observedAt": "2026-02-30T00:00:00Z",
                }
            )
            try:
                validate_instance(receipt, schema, root_schema=schema)
            except SchemaError:
                return {"valid": False, "failureCodes": ["SCHEMA_REJECTED"]}
            return {"valid": True, "failureCodes": []}
        return evaluate_reasoning_surface_receipt(receipt, **kwargs)

    if fixture_id == "browser-operation-hostile":
        receipt, registry = _fixture_browser_receipt(root)
        if scenario_id == "repository-browser-with-cli-available":
            receipt.update({"purposeClass": "REPOSITORY_RETRIEVAL", "browserNecessity": "NOT_REQUIRED"})
            receipt["nonBrowserAlternatives"][0]["satisfiesCapability"] = True
        elif scenario_id == "second-transient-tab-no-exception":
            receipt["agentOpenedTabIds"] = ["agent-1", "agent-2"]
        elif scenario_id == "close-other-transaction-tab":
            receipt["agentOpenedTabIds"] = ["agent-1"]
            receipt["actions"] = [_browser_action("CLOSE", "agent-1")]
            receipt["actions"][0]["transactionId"] = "other-transaction"
        elif scenario_id == "close-unknown-stale-tab":
            receipt["actions"] = [_browser_action("CLOSE", "stale-tab", "FAILED")]
            receipt["actions"][0]["ownershipClass"] = "UNKNOWN"
            receipt["actions"][0]["closedByActor"] = None
        elif scenario_id == "navigate-owner-existing-tab":
            receipt["actions"] = [_browser_action("NAVIGATE", receipt["baselineTabs"][0]["tabId"])]
            receipt["actions"][0].update({"ownershipClass": "OWNER_EXISTING", "protected": True})
        elif scenario_id == "cleanup-leaves-agent-tab":
            receipt["agentOpenedTabIds"] = ["agent-1"]
            receipt["actions"] = [_browser_action("OPEN", "agent-1"), _browser_action("CLOSE", "agent-1", "FAILED")]
            receipt["cleanup"] = {"policy": "CLOSE_ONLY_AGENT_OPENED", "attempted": True, "results": [{"tabId": "agent-1", "result": "FAILED"}], "remainingAgentTabIds": ["agent-1"]}
        elif scenario_id == "observe-absence-attributes-actor":
            receipt["actions"] = [_browser_action("OBSERVE_ABSENT", "stale-tab", "OBSERVED")]
            receipt["actions"][0].update({"ownershipClass": "UNKNOWN", "closedByActor": "routing-executor"})
        elif scenario_id == "claimed-tab-without-open-or-proof":
            receipt["agentOpenedTabIds"] = ["ghost-tab"]
        elif scenario_id == "cleanup-state-contradicts-actions":
            receipt["agentOpenedTabIds"] = ["agent-1"]
            receipt["actions"] = [_browser_action("OPEN", "agent-1")]
        elif scenario_id == "close-before-open":
            receipt["agentOpenedTabIds"] = ["agent-1"]
            receipt["actions"] = [
                _browser_action("CLOSE", "agent-1"),
                _browser_action("OPEN", "agent-1"),
            ]
            receipt["cleanup"] = {
                "policy": "CLOSE_ONLY_AGENT_OPENED",
                "attempted": True,
                "results": [{"tabId": "agent-1", "result": "SUCCEEDED"}],
                "remainingAgentTabIds": [],
            }
        return evaluate_browser_operation(receipt, ownership_registry=registry)

    raise SchemaError(f"unimplemented hostile scenario {fixture_id}:{scenario_id}")


def validate_repository(
    root: Path, *, external_evidence_repository: Path | None = None
) -> list[str]:
    findings: list[str] = []
    invalid_json = parse_all_json(root)
    if invalid_json:
        raise SchemaError(f"invalid JSON: {invalid_json}")

    for schema_name, template_name in SCHEMA_TEMPLATE_PAIRS.items():
        schema = json.loads((root / "schemas" / schema_name).read_text(encoding="utf-8"))
        template = json.loads((root / "templates" / template_name).read_text(encoding="utf-8"))
        if schema.get("$schema") != "https://json-schema.org/draft/2020-12/schema":
            raise SchemaError(f"{schema_name}: unsupported or missing meta-schema")
        validate_instance(template, schema, root_schema=schema)
        findings.append(f"schema+template:{schema_name}:{template_name}:PASS")

    claim = json.loads((root / "templates" / "CLAIM-RECORD.json").read_text(encoding="utf-8"))
    claim["claimDigest"]["value"] = claim_digest(claim)
    claim["claimDigest"]["byteLength"] = len(_jcs_text({key: value for key, value in claim.items() if key != "claimDigest"}).encode("utf-8"))
    validate_claim_record(claim)
    findings.append("template-instantiation:claim-record:PASS")

    authority_registry_document = json.loads((root / "templates" / "AUTHORITY-SOURCE-REGISTRY.json").read_text(encoding="utf-8"))
    ImmutableAuthoritySourceRegistry.from_document(authority_registry_document)
    browser_registry_document = json.loads((root / "templates" / "BROWSER-OWNERSHIP-REGISTRY.json").read_text(encoding="utf-8"))
    ImmutableBrowserOwnershipRegistry.from_document(browser_registry_document)
    transition_registry_document = json.loads(
        (root / "templates" / "CLAIM-TRANSITION-REGISTRY.json").read_text(
            encoding="utf-8"
        )
    )
    ImmutableClaimTransitionRegistry.from_document(transition_registry_document)
    independence_registry_document = json.loads(
        (root / "templates" / "REPRODUCTION-INDEPENDENCE-REGISTRY.json").read_text(
            encoding="utf-8"
        )
    )
    ImmutableReproductionIndependenceRegistry.from_document(
        independence_registry_document
    )
    findings.append("template-instantiation:immutable-registries:PASS")

    with tempfile.TemporaryDirectory() as temporary:
        ledger_root = Path(temporary)
        reasoning = json.loads((root / "templates" / "REASONING-SURFACE-OBSERVATION-RECEIPT.json").read_text(encoding="utf-8"))
        reasoning_result = evaluate_reasoning_surface_receipt(
            reasoning,
            required_role="PRO",
            required_account_ref=reasoning["requiredAccountRef"],
            required_subject_ref=reasoning["subjectBinding"]["reviewSubjectRef"],
            required_repository_head=reasoning["subjectBinding"]["boundRepositoryHeads"][0],
            input_payload_bytes=b"",
            submitted_payload_bytes=b"",
            payload_transform=None,
            admission_question_bytes=b"",
            response_payload_bytes=b"",
            consumption_store=DurableReceiptConsumptionStore(ledger_root / "template.jsonl"),
        )
        if reasoning_result["valid"] or "REASONING_RECEIPT_INCOMPLETE" not in reasoning_result["failureCodes"]:
            raise SchemaError("partial reasoning template did not fail closed")
        findings.append("template-instantiation:reasoning-partial-fails-closed:PASS")

        browser = json.loads((root / "templates" / "BROWSER-OPERATION-RECEIPT.json").read_text(encoding="utf-8"))
        browser_registry = _empty_browser_registry()
        browser["priorOwnershipRegistryRef"] = browser_registry.registry_id
        browser["priorOwnershipRegistryDigest"] = browser_registry.registry_digest
        if not evaluate_browser_operation(browser, ownership_registry=browser_registry)["allowed"]:
            raise SchemaError("browser template is not a valid signed-in reasoning route")
        findings.append("template-instantiation:browser-operation:PASS")

    expected_codes = CLAIM_FAILURE_CODES | REASONING_FAILURE_CODES | BROWSER_FAILURE_CODES | {"ROOT_RED", "RELEASE_BLOCKED", "UNKNOWN", "SCHEMA_REJECTED", "SCIENTIFIC_SCOPE_UNAUTHORIZED", "AUTHORIZED_POLICY"}
    with tempfile.TemporaryDirectory() as hostile_temporary:
        ledger_root = Path(hostile_temporary)
        for fixture_name in (
            "claim-authority-provenance-hostile.json",
            "reasoning-surface-receipt-hostile.json",
            "browser-operation-hostile.json",
        ):
            fixture = json.loads((root / "evals" / "mission-control" / fixture_name).read_text(encoding="utf-8"))
            scenario_ids = [scenario["id"] for scenario in fixture["scenarios"]]
            if len(scenario_ids) != len(set(scenario_ids)):
                raise SchemaError(f"{fixture_name}: duplicate scenario id")
            invalid_expected = [scenario["expected"] for scenario in fixture["scenarios"] if scenario["expected"] not in expected_codes]
            if invalid_expected:
                raise SchemaError(f"{fixture_name}: invalid expected codes {invalid_expected}")
            for scenario in fixture["scenarios"]:
                result = execute_hostile_scenario(
                    root,
                    fixture["fixtureId"],
                    scenario,
                    ledger_root,
                )
                allowed = result.get("allowed", result.get("valid", result.get("admitted")))
                if allowed is not scenario.get("expectedAllowed", False):
                    raise SchemaError(
                        f"{fixture_name}:{scenario['id']}: expected allowed={scenario.get('expectedAllowed', False)!r}, got {allowed!r}"
                    )
                if scenario["expected"] not in result.get("failureCodes", []):
                    raise SchemaError(
                        f"{fixture_name}:{scenario['id']}: expected {scenario['expected']}, got {result.get('failureCodes', [])}"
                    )
            findings.append(
                f"hostile-fixture:{fixture_name}:{len(fixture['scenarios'])}-executed:PASS"
            )

    browser_incident = json.loads((root / "feedback" / "mission-control" / "MC-BROWSER-REPO-TAB-SPRAWL-20260901-001.json").read_text(encoding="utf-8"))
    if browser_incident["disposition"] != {
        "currentTabState": "CLOSED_OR_STALE_AS_REPORTED",
        "closedByActor": "UNKNOWN",
        "cleanupAttributionState": "UNATTRIBUTED",
        "inferenceAuthorized": False,
    }:
        raise SchemaError("browser incident attribution is not fail closed")
    mode_incident = json.loads((root / "feedback" / "mission-control" / "MC-PRO-MODE-RECEIPT-MISMATCH-20260901-001.json").read_text(encoding="utf-8"))
    if mode_incident["priorTransaction"]["proMetaReviewAuthoritative"] is not False:
        raise SchemaError("prior mode mismatch was made authoritative")
    sanitized = json.loads((root / "feedback" / "mission-control" / "PRO-META-A40D413-SANITIZED-EVIDENCE-RECEIPT-20260901.json").read_text(encoding="utf-8"))
    artifact_bytes = (
        read_bound_external_artifact(external_evidence_repository)
        if external_evidence_repository is not None
        else None
    )
    validate_sanitized_pro_evidence(sanitized, artifact_bytes=artifact_bytes)
    findings.append(
        "external-evidence:exact-artifact-extraction:PASS"
        if artifact_bytes is not None
        else "external-evidence:binding-contract:PASS"
    )
    findings.append("incident-dispositions:PASS")
    return findings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default=".")
    parser.add_argument(
        "--external-evidence-repository",
        help="local clone containing the bound Human Design evidence commit",
    )
    args = parser.parse_args()
    try:
        findings = validate_repository(
            Path(args.root).resolve(),
            external_evidence_repository=(
                Path(args.external_evidence_repository).resolve()
                if args.external_evidence_repository
                else None
            ),
        )
    except (OSError, KeyError, ValueError, SchemaError) as exc:
        print(f"Mission Control provenance validation failed: {exc}", file=sys.stderr)
        return 1
    for finding in findings:
        print(finding)
    print(f"Mission Control provenance validation passed ({len(findings)} checks)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
