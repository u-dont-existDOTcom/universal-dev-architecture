# Existing-work scan: escaping LLM output attractors in open-ended prose

Date: 2026-09-01
Scope: bounded scan of primary research relevant to repeated structural convergence, self-refinement, multi-agent debate, diverse decoding, and quality-diversity search.

## Independent conception preserved

The pre-search conception is recorded separately in `docs/conceptions/2026-09-01-model-attractor-independence-snapshot.md`. Existing work supplements rather than replaces the owner's observation that multi-model debate failed in the Authorial Graph project and that the main defect may lie in the shared interaction structure.

## What established work already explains

### Structured prompts can collapse diversity

Yun et al., *The Price of Format: Diversity Collapse in LLMs* (Findings of EMNLP 2025, ACL Anthology 2025.findings-emnlp.836, DOI 10.18653/v1/2025.findings-emnlp.836) report that role markers and structural tokens constrain open-ended output space, that the collapse persists under high-temperature sampling, and that minimal formatting produces the greatest diversity in their tests.

Reuse: keep writer packets minimal and positive. Move prohibitions, counters, and evaluation machinery outside the writer context.

### Self-refinement can polish and reinforce the model's own bias

Xu et al., *Pride and Prejudice: LLM Amplifies Self-Bias in Self-Refinement* (ACL 2024, 2024.acl-long.826, DOI 10.18653/v1/2024.acl-long.826) find self-bias across six model families. Self-refinement improved fluency and understandability but amplified preference for the model's own generations; accurate external feedback reduced the bias more effectively.

Reuse: do not ask the writer to evaluate and repair its own candidate. Separate literal evaluation from generation, and do not feed critic prose back as a rewrite prompt.

### Multi-agent interaction can create collective diversity collapse

Chen et al., *Diversity Collapse in Multi-Agent LLM Systems: Structural Coupling and Collective Failure in Open-Ended Idea Generation* (Findings of ACL 2026, 2026.findings-acl.13, DOI 10.18653/v1/2026.findings-acl.13) find diminishing diversity from stronger aligned models, authority-driven suppression of semantic diversity, diminishing returns from group size, and faster premature convergence under dense communication. They attribute the collapse primarily to interaction structure rather than simple model insufficiency.

Reuse: preserve independence and disagreement mechanically. Do not create a writer/critic debate graph for creative generation.

### Longer debate is especially fragile on generative tasks

Becker et al., *Stay Focused: Problem Drift in Multi-Agent Debate* (Findings of EACL 2026, 2026.findings-eacl.268, DOI 10.18653/v1/2026.findings-eacl.268) report problem drift in 76–89% of the generative-task debates they studied. Lack of progress, low-quality feedback, and unclear goals were the most common expert-coded causes; longer debates can harm performance.

Reuse: use bounded one-shot generation and one-shot blind evaluation. A failed candidate changes the experiment design or behavior-cell allocation, not an open-ended argument.

### Diversity can be induced by explicit avoidance of prior outputs

Park et al., *Avoidance Decoding for Diverse Multi-Branch Story Generation* (EMNLP 2025, 2025.emnlp-main.381, DOI 10.18653/v1/2025.emnlp-main.381) modify token logits to penalize concept-level and narrative-level similarity to earlier branches, reporting up to 2.6× greater diversity and about 30% less repetition.

Partial reuse: consumer ChatGPT does not expose logits, so the decoding method cannot be reproduced exactly. Adapt the principle outside the model: maintain an archive, measure structural similarity after generation, and allocate the next independent run to an unoccupied behavior cell. Do not show the archive to the writer.

### Parallel diverse decoding is a model-level solution, not a chat-graph solution

Vilnis et al., *Arithmetic Sampling: Parallel Diverse Decoding for Large Language Models* (ICML 2023, PMLR 202:35120–35136) provide provable diversity under conditions while preserving unbiased expectations from the original model distribution.

Incompatible for the current consumer-chat surface: it requires decoding control. It is a benchmark for what a future API or local-model implementation could do more directly.

### Quality-diversity search provides the right search abstraction

Mouret and Clune, *Illuminating Search Spaces by Mapping Elites* (2015, arXiv:1504.04909), and Pugh, Soros, and Stanley, *Quality Diversity: A New Frontier for Evolutionary Computation* (Frontiers in Robotics and AI 2016, DOI 10.3389/frobt.2016.00040) replace single-best optimization with an archive of the best candidate found in each behavior niche. The QD literature also warns that poorly chosen behavior characterizations can be unaligned with quality and recommends multiple complementary behavior characterizations in difficult domains.

Adapt: define a small set of editorially meaningful structural descriptors and retain at most one candidate per cell. Quality is blind editorial naturalness plus semantic fidelity; diversity descriptors are not themselves quality scores.

### Thinking-language variation is a possible experimental axis

Xu and Zhang, *Language of Thought Shapes Output Diversity in Large Language Models* (ACL 2026, 2026.acl-long.628, DOI 10.18653/v1/2026.acl-long.628) report greater English-output diversity when internal thinking is conducted in non-English languages, with additional gains from mixing thinking languages.

Experiment only: this may shift the sampled region, but it is not evidence of human prose quality or fidelity. It belongs as one bounded behavior-cell axis after the basic isolation experiment, not as a default fix.

### Diversity metrics can reward shortness by mistake

Deshpande et al., *Diverse, not Short* (EMNLP 2025, 2025.emnlp-main.1721, DOI 10.18653/v1/2025.emnlp-main.1721) show that common diversity metrics and preference rewards systematically favor shorter outputs. Their length-controlled selection improves lexical and semantic diversity while maintaining length parity.

Reuse: compare candidates within a fixed word-count band and report diversity after length control. A shorter paragraph is not automatically a more diverse paragraph.

## What is not already solved

No established turnkey method was found for producing naturally human short literary prose from a closed consumer chat model while simultaneously preserving exact authorial meaning, preventing invented specificity, and avoiding the model's reflective-expository attractor.

The literature offers components:

- minimize formatting;
- preserve independence;
- avoid serial self-refinement and dense debate;
- sample in parallel;
- discourage similarity to an archive;
- search for quality and diversity jointly;
- control length;
- use external blind evaluation.

The unresolved work is composing those components under the current product constraints and validating them against owner editorial judgment rather than generic diversity scores.

## Build/adapt/reuse decision

- **Reuse:** minimal writer contexts, independent sampling, blind external evaluation, length control, exact provenance.
- **Adapt:** quality-diversity archive and post-generation structural avoidance because logits and embeddings are unavailable.
- **Reject:** Claude/GPT debate, same-candidate self-refinement loops, dense role graphs, and more prompt prohibitions as the default response to failure.
- **Experiment:** same-model direct execution versus n8n-isolated execution versus Hermes isolated-profile execution with memory disabled.
- **Invent only where necessary:** a small editorial behavior-cell taxonomy and a fail-closed provenance layer connecting candidates, runtimes, and evaluations.

## Strongest practical baseline

The strongest feasible baseline is not another model. It is a same-model, minimal-prompt, independent-batch generator with no cross-candidate communication, followed by blind owner/editorial evaluation. n8n and Hermes must beat that baseline while model, prompt, sample count, and evaluation remain fixed.

## Stop rule

After the preregistered candidate budget, continue only if at least one arm shows either:

1. a genuine blind editorial pass; or
2. a material increase in occupied structural cells together with preserved semantic fidelity and a credible path to editorial improvement.

Otherwise close the generative reconstruction lane and move to owner-speech or owner-authored source transformation.
