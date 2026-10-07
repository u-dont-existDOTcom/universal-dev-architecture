# Keep follow-up research bound to the owner's primary phenotype

- For: `u-dont-existDOTcom/AskRigor`
- Filed: 2026-10-07, by the ChatGPT research-supervisor session using AskRigor
- From: owner correction during medicinal-plant / male-vitality research on 2026-10-07
- Owner request: yes. The owner corrected the proposed next task because the primary research goal is to find something that reproduces a dramatic physical-strength / low-effort "super strong" state; libido is secondary.
- Existing pull request: none
- Supersedes: none

## What to do

Add a follow-up-selection control for long-running research missions.

1. **Freeze the primary phenotype separately from secondary correlated outcomes.**
   For this task class, keep a ranked outcome vector such as:
   - primary: large noticeable increase in physical strength / force / effortless work capacity;
   - secondary: motivation, energy, libido, erection quality, testosterone, etc.
   A strong secondary signal must not silently redefine the target.

2. **Before proposing the next research task, score candidate follow-ups by expected information gain on the primary phenotype.**
   Prefer a discovery lane that can surface new primary-phenotype candidates over deeper characterization of a secondary endpoint unless that characterization is likely to discriminate the primary mechanism or identify a primary candidate.

3. **Activate ethnobotanical / traditional-use discovery when formal candidate coverage is narrow.**
   Search cross-cultural reports for plants/preparations explicitly associated with strength, physical power, work capacity, stamina/endurance, carrying/labor, hunting/warrior use, wrestling/athletics, fatigue resistance, or unusually easy exertion. Do not equate generic "tonic", "virility", "aphrodisiac", or "vitality" language with strength unless the source does.
   For promising candidates, preserve plant part, preparation, route, culture/community, claimed magnitude/salience, frequency of independent traditional reports, and modern acquirability.

4. **Acquirability belongs in discovery ranking.**
   After identifying ethnobotanical candidates, check whether authenticated plant material, seeds, extracts, or a materially matching commercial preparation can realistically be obtained. Availability should raise practical priority but never substitute for effect evidence.

5. **Follow-up admission field.**
   Before emitting a "next suggested task", require:
   - `parent_primary_outcome_preserved = PASS`
   - `followup_primary_information_gain = HIGH|MEDIUM|LOW`
   - `secondary_endpoint_drift = PASS`
   A LOW-information-gain secondary follow-up cannot outrank an available HIGH-information-gain discovery pass on the primary phenotype.

## Why

The research drifted from the owner's primary goal. After finding that Nan Bao has a mixed sexual-function signal and some rapid-fade anecdotes, the proposed next pass was to extract detailed Nan Bao time-course phenotypes. That is interesting, but it mainly deepens libido/erection evidence. The owner clarified that the mission is to find something that can reproduce the striking physical-strength / effortless-exertion state; libido is secondary.

A better next step was visible from the evidence frontier: broaden discovery through ethnobotanical literature and oral/traditional-use records, especially where cultures explicitly regard a plant as producing strength, stamina, work capacity, or unusual physical power. That can discover candidates omitted by biomedical trial databases, then route the best ones through identity, safety, real-world signal and shopping/acquirability checks.

This is an owner-goal follow-up failure: the proposed continuation was locally interesting but lower-value for the parent outcome.

## Check first

- Reuse the existing owner-goal/follow-up and candidate-coverage machinery rather than adding a separate research planner.
- Compose with HRP's `EthnobotanicalSpecificity`, `HeterodoxEpistemology`, `ExtendedHumanEvidenceAndGreyLiteratureSweep`, and the Universal coverage/consilience rules.
- Do not convert "aphrodisiac", "male tonic", "virility", "vitality" or testosterone claims into strength evidence.
- A traditional claim can be high-priority discovery evidence without being called clinically established.
- Regression:
  1. Owner goal = find a botanical that produces a large noticeable physical-strength / effortless-work state; libido secondary.
  2. Current candidate Nan Bao has several erection/libido reports and one rapid-fade report but almost no strength reports.
  3. Available next tasks: (A) mine more Nan Bao erection time courses; (B) run a cross-cultural ethnobotanical search for explicit strength/work-capacity plants, then filter by acquirability.
  4. Expected: choose B as the next task unless A has a documented mechanism-discrimination value for the primary strength phenotype.
