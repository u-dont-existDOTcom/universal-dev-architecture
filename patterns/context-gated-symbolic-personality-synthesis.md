# Context-Gated Symbolic Personality Synthesis

## Status

Reusable architecture for building and evaluating a multi-system symbolic personality model without treating broad traits as globally active or tailoring interpretations until every statement appears correct.

This is a descriptive and hypothesis-generating workflow. It does not establish scientific validity for astrology, Human Design, or any other symbolic system.

## Independent conception snapshot

### Problem

Most symbolic personality systems issue global trait statements even when a person's stable pattern is conditional: the same person may initiate strongly in self-owned work, wait for recognition in social entry, become highly directive after invitation, and withdraw under misrecognition. Averaging these modes creates apparent contradictions and weak readings.

### Candidate mechanism

Treat the natal/symbolic configuration as a set of latent processing modules and route their expression through explicit situational gates. The stable personality is the person's repeatable **if-context-then-mode** signature, not one global adjective.

### Constraints

- Freeze the behavioral target before interpretation.
- Preserve exact birth-data and calculation assumptions.
- Do not add symbols merely to repair a miss.
- Do not count systems sharing the same astronomical inputs as independent confirmation.
- Record contradictions and unexplained residuals.
- Require holdout predictions and decoy comparisons before claiming improvement.

## Existing-work disposition

### Reuse

- **Cognitive-Affective Processing System (CAPS):** stable if-then behavioral signatures and context-triggered processing units.
- **Whole Trait Theory:** traits as distributions of momentary states with meaningful within-person variability.
- **Experience-sampling / idiographic personality methods:** observe one person's context-behavior contingencies over time.
- **Human Design topology:** type, authority, profile, centers, channels, gates, and definition as candidate routing/mechanics features.
- **Huber Astrological Psychology:** aspect structure as an interaction graph rather than isolated placement keywords.
- **Cosmobiology:** tight midpoint pictures as lower-flexibility composite features.
- **Classical natal techniques:** sect, rulership, dignity, angularity, and houses for domain and regulatory context.

### Adapt

Use psychological context models as the inference architecture while retaining symbolic systems only as fixed, reproducible feature generators.

### Reject by default

- Unlimited asteroids, lots, harmonics, symbolic degrees, or alternative zodiacs introduced after seeing a mismatch.
- Wide-orb or generic sign statements used to override tighter contradictory configurations.
- Treating post-hoc training fit as predictive validity.

### Novel remainder

A domain-routing layer that distinguishes at minimum:

1. self-owned creation vs recognition-dependent entry;
2. private incubation vs public transmission;
3. aligned/competent invitation vs indiscriminate access;
4. truthful/coherent environment vs deceptive/incoherent environment;
5. intimate bond vs unfamiliar group;
6. resourced state vs depletion/overload;
7. immediate bodily safety judgment vs abstract strategic reasoning.

## Model layers

### 1. Calculation layer

- Tropical geocentric longitudes and angles from a reproducible ephemeris.
- Declared house system(s); use a single system per analytic function rather than switching opportunistically.
- Human Design Personality and Design positions, with the Design moment found by exact 88-degree solar arc.
- Optional sidereal/BaZi comparison only as an explicit competing model, not as a repair kit.

### 2. Structural feature layer

Prioritize by decreasing interpretive constraint:

1. exact aspect patterns and angularity;
2. tight midpoint pictures;
3. Human Design completed channels, definition topology, authority and profile;
4. dispositorship, sect, dignity and house concentration;
5. individual gates/lines and sign placements;
6. broad archetypal keywords.

### 3. Latent module layer

Candidate modules include:

- observer / boundary filter;
- autonomous builder;
- invited guide;
- conceptual translator;
- somatic veto or safety detector;
- relational bonding;
- forensic corrector under incoherence;
- retreat / recovery;
- public transmitter.

Each module must cite the fixed structural features that justify it and list its expected failure mode.

### 4. Context router

Represent a situation as a context vector, for example:

- ownership: self-owned / shared / externally controlled;
- interpersonal consent or recognition required: no / weak / strong;
- familiarity: unfamiliar / known / intimate;
- trust: unknown / coherent / deceptive;
- role clarity: absent / invited / formally assigned;
- stakes: low / high;
- energy: resourced / pressured / depleted;
- temporal demand: immediate / deliberative.

Routing rules take the form:

> If context conditions C are present, activate module M with intensity I, inhibition H, and likely transition T.

Do not reinterpret a global claim as contextual after a contradiction appears unless the context rule is specified prospectively and tested elsewhere.

### 5. Output layer

For each domain, report:

- baseline mode;
- trigger for entry;
- behavior after correct entry;
- behavior under misrecognition or incoherence;
- recovery pattern;
- strongest symbolic supports;
- contradictory indicators;
- confidence and residual.

## Calibration protocol

1. Freeze the known profile and reserve at least 20 percent of traits as holdout.
2. Generate chart-derived predictions for the holdout before seeing answers.
3. Ask discriminating questions that separate competing mechanisms rather than solicit agreement.
4. Fit the smallest set of context rules that resolves true conditionality.
5. Penalize each added rule, symbol class, orb expansion, or alternate calculation setting.
6. Compare against:
   - the strongest single established system;
   - a simple two-system composition;
   - at least three plausible decoy charts or nearby timestamps;
   - a non-astrological CAPS/Whole-Trait description using behavioral data alone.
7. Prefer the model only if it improves holdout accuracy and discrimination, not merely autobiographical richness.

## Evaluation metrics

Keep scores heuristic unless a real dataset supports statistical inference.

- target coverage;
- direct contradiction rate;
- context-contingency accuracy;
- specificity / base-rate penalty;
- complexity penalty;
- holdout prediction accuracy;
- decoy discrimination;
- stability to calculation choices;
- amount of post-hoc reinterpretation;
- residual profile mass left unexplained.

A useful composite can use minimum-description-length logic:

> model value = holdout fit + decoy discrimination - contradiction penalty - interpretive-flexibility penalty - complexity penalty.

## Falsification and longitudinal test

Use a brief experience-sampling log for 30-60 days. Record situation type, whether recognition/consent was required, initial bodily signal, chosen action, emotional state, energy before/after, and outcome. Pre-register the model's context rules before collecting the log. Compare observed transitions with predicted module activation.

## Reuse rule

For future symbolic-profile projects, reuse this architecture and create a project-specific calibration record outside the universal repository. Do not place private birth data or behavioral histories in a public universal repository without explicit consent.
