# Structured Natal-Chart Comparison

## Purpose

Reusable workflow for comparing Western Tropical natal charts without collapsing the interpretation into generic Sun-sign prose. This pattern is also suitable for blinded chart/personality matching experiments.

## Baseline method

Use an expert-astrologer frame specializing in Western Tropical Astrology and psychological chart synthesis.

For each profile, require:

1. **Placements comparison table**
   - Sun
   - Moon
   - Ascendant / Rising
   - Mercury
   - Venus
   - Mars
   - approximate degree and sign for each

2. **Key divergences**
   - Emotional temperament & coping mechanisms: Moon, element/modality, essential dignity, and close aspects
   - Outer persona & initial approach: Ascendant and close angular contacts
   - Drive, initiative & conflict style: Mars, dignity, element/modality, and close aspects
   - Intellectual & relational dynamics: Mercury and Venus, dignities, conjunctions/aspects, and relevant dispositor context

3. **Core synthesis**
   - concise contrast of the charts' fundamental operating modes
   - prefer conditional psychological language over generic trait catalogues

## Calculation requirements

- Western Tropical Zodiac.
- Use an ephemeris/calculation engine rather than estimating placements from memory.
- Use the historically correct local civil-time offset, including DST where applicable.
- Preserve exact location and birth time supplied by the user.
- Report approximate degrees so close sign-boundary and aspect claims are auditable.
- For house/Ascendant work, state the house system; default to Placidus unless the task specifies otherwise.

## Essential dignities

For Sun, Moon, Mercury, Venus, Mars (and Jupiter/Saturn when material), explicitly flag:

- domicile
- exaltation
- detriment
- fall

Do not treat dignity as a simple good/bad score. Use it as a modifier describing whether the planet's conventional mode of expression is strengthened, constrained, redirected, or made less straightforward.

## Aspect extension

The baseline six-placement comparison is incomplete without major aspects. Always inspect close major aspects that materially modify the personal placements:

- conjunction
- opposition
- square
- trine
- sextile

Also inspect close contacts to the Ascendant/MC and materially relevant contacts from Jupiter, Saturn, Uranus, Neptune, and Pluto.

Prioritize tighter aspects. Do not inflate a reading by listing every loose aspect; synthesize the few relationships that change the behavioral interpretation.

## Anti-generic rule

Avoid statements that could plausibly describe almost everyone. Prefer discriminating contrasts such as:

- immediate expression vs delayed/suppressed expression
- emotional fusion vs emotional compartmentalization
- novelty-seeking vs security-seeking
- interpersonal pursuit vs withdrawal under conflict
- abstract/global cognition vs detail-first cognition
- conventional compliance vs internally governed conscientiousness
- need for visibility vs preference for private influence

When a chart contains apparently contradictory signatures, model the **conditional structure** instead of averaging them into a vague midpoint: specify the contexts in which each tendency is expected to dominate.

## Blinded personality-matching extension

When the task is to identify which chart belongs to a known person among decoys:

1. Freeze the candidate set before ranking.
2. Calculate every candidate using identical settings.
3. Do not regenerate or hand-pick decoys after seeing results.
4. Freeze a target personality description separately from the charts.
5. Compare charts on the same psychological dimensions rather than free-writing a different narrative for each candidate.
6. Use pairwise comparisons or a tournament among plausible finalists so each judgment is explicitly contrastive.
7. Keep birth-date identity hidden from the personality synthesis as far as practical; do not use known age/cohort or biographical lookup as evidence.
8. Record the ranking before revealing the true chart.
9. If repeating the test, distinguish exploration from confirmatory trials.

## Dual-pass synthesis: exact then intuitive

For exploratory matching, preserve two distinct passes rather than blending them invisibly.

### Pass 1 — exact/auditable

- Calculate positions, houses, angles, dignities, and major aspects first.
- Generate a structured personality model from the exact chart geometry.
- Compare candidates on the same explicit behavioral dimensions.
- Record the ranking before any free-form intuitive pass.

### Pass 2 — intuitive/gestalt

After the exact pass is frozen, temporarily stop treating placements as additive trait scores. Ask instead:

> What whole person would this chart most naturally describe, including its internal contradictions, compensations, timing, and conditional behavior?

The intuitive pass should emphasize **configurations**, not isolated symbols. Examples:

- quiet/private Ascendant + strongly Uranian cognition = externally reserved but internally radical
- water-heavy attachment + Aquarius/Uranus = deep bonding without conventional possessiveness
- Mars restrained by Saturn/12th-house/Neptune + Pluto trigger = frustration held until a specific boundary or honesty violation produces intensity
- strong Gemini/Uranus curiosity + earth/Saturn structure = exploratory mind that can become systematic when a problem warrants it
- Virgo/Cancer/service signatures + low-status Aquarius/Pisces emphasis = conscientious care without conventional status motivation

The intuitive pass may reorder candidates, but it **must not overwrite the exact ranking**. Save both rankings so later outcome data can tell whether intuition added signal or merely increased narrative overfitting.

For confirmatory tests, pre-register whether the exact ranking, intuitive ranking, or a defined combination is the primary endpoint.

## Standard comparison prompt

Act as an expert astrologer specializing in Western Tropical Astrology and psychological chart synthesis.

Compare the astrological charts and personality dynamics for the following two birth profiles:

- Profile A: [Date, Exact Time, City, State/Country]
- Profile B: [Date, Exact Time, City, State/Country]

Structure your response with the following framework:

1. **Placements Comparison Table:** Provide a compact Markdown table comparing the key personal placements (Sun, Moon, Rising/Ascendant, Mercury, Venus, Mars) with approximate degrees and sign locations.
2. **Key Divergences:** Break down the major behavioral and psychological differences into distinct thematic categories:
   - *Emotional Temperament & Coping Mechanisms* (Moon sign analysis, essential dignities, elements, and close aspects)
   - *Outer Persona & Initial Approach* (Ascendant / Rising sign dynamics and close angular contacts)
   - *Drive, Initiative & Conflict Style* (Mars placement, dignity, elemental motivation, and close aspects)
   - *Intellectual & Relational Dynamics* (Mercury & Venus placements, dignities, and major alignments)
3. **Core Synthesis:** Provide a concise final synthesis contrasting the fundamental operating modes of both profiles.

Requirements:
- Calculate placements using the Western Tropical Zodiac and historically correct local civil-time offsets.
- Avoid vague horoscope generalizations; use precise, discriminating psychological and behavioral terminology.
- Highlight essential dignities (domicile, exaltation, detriment, fall) that materially modify expression.
- Include tight major aspects and angular contacts when they materially change the synthesis.
- State the house system when houses/angles are used.

## Provenance

Baseline comparison structure supplied by the user after a successful Gemini astrology workflow; aspect, calculation, anti-generic, blinded-ranking, and exact-vs-intuitive dual-pass extensions added for reproducibility and reuse.
