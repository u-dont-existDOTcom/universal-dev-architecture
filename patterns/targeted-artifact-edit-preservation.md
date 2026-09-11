# Targeted artifact edit preservation

Status: **CURRENT UNIVERSAL PATTERN**

## Rule

When the owner asks to update, fix, correct, retouch, or otherwise make a **targeted change** to an existing artifact, treat everything outside the requested delta as protected by default.

A targeted edit is not implicit permission to redesign, regenerate, restyle, reinterpret, simplify, modernize, or replace unrelated parts of the artifact. A whole redesign requires explicit owner authorization.

This applies to images, infographics, diagrams, slides, documents, websites, UI screens, charts, code-generated visuals, and other artifacts where a local repair can accidentally alter surrounding content or presentation.

## Protected baseline

Before editing, identify:

1. the exact source artifact;
2. the exact requested change;
3. the smallest practical edit boundary;
4. the attributes outside that boundary that must remain unchanged.

For visual artifacts, protected attributes normally include, unless the owner explicitly asks to change them:

- people and character identity/presentation, including skin tone, apparent age, gender presentation, facial features, hair, clothing, pose, expression, and relationships between figures;
- composition, crop, aspect ratio, spatial arrangement, object count, and hierarchy;
- typography, wording, logos, branding, icons, ornaments, borders, and decorative motifs;
- palette, lighting, illustration style, texture, background, and visual era;
- factual labels, numbers, arrows, sequence, and diagram topology;
- all existing elements not implicated by the requested correction.

Do not infer that an unrelated attribute may be refreshed merely because a generative tool would naturally reinterpret it.

## Image-generation/editing boundary

When changing an existing image, use the original image as the edit target and phrase the operation as a constrained edit, not a fresh recreation.

The edit instruction should contain both:

- **change set:** the exact elements to alter; and
- **preservation set:** explicit instruction to keep all other people, identities, visual attributes, layout, style, and content unchanged.

If the available tool cannot reliably preserve the untouched regions or would require regenerating the whole image, do not silently accept broad drift. Prefer a more surgical editing method when available. If no suitable method exists, state the limitation before claiming the result is a targeted edit.

## Pre-delivery comparison

For a targeted edit, compare source and result specifically for unintended changes outside the authorized delta.

At minimum ask:

- Did any person or character change appearance or identity attributes?
- Did any text change beyond the approved wording?
- Did layout, crop, color, icons, objects, or style drift?
- Did the edit add, remove, or reinterpret anything unrelated?

Any unexplained outside-delta change is a failed targeted edit, even if the requested correction itself is successful.

Do not rationalize incidental drift as an improvement. Restore the source attribute or redo the edit.

## Full-redesign distinction

A request such as `redesign this`, `make a new version`, `reimagine this`, or an explicit authorization to change the whole artifact opens a broader design space.

A request such as `update this section`, `fix this text`, `change the color of X`, `remove Y`, `replace this image`, or `bring this up to date` does **not**.

When scope is ambiguous and a broad redesign would materially alter protected content, default to the targeted interpretation rather than expanding scope.

## Provenance and transfer rationale

Originating incident: 2026-09-11, an infographic update for the Inner Signal self-hypnosis guide. A whole-image regeneration corrected requested content but unintentionally changed the depicted Black mother and daughter into lighter/white-presenting figures. The owner explicitly corrected the process: future targeted edits must preserve parts that do not need changing unless a whole redesign is requested.

Transfer rationale: generative and reconstruction tools commonly introduce collateral changes outside the requested edit boundary. The failure mode applies across projects and artifact types, so the lesson is universal rather than article-specific.

## Limits

This pattern does not prohibit necessary dependent changes. If changing one element mechanically requires another change for correctness, accessibility, layout integrity, or factual coherence, make that dependency explicit and keep it as small as possible.

It also does not require pixel identity when the owner asks for a broad redesign or when the artifact must be rebuilt from an unavailable/invalid source. In those cases, label the operation accurately as reconstruction/redesign rather than targeted editing.