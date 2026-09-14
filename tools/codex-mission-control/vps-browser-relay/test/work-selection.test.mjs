import assert from 'node:assert/strict';
import test from 'node:test';
import { workSelectionControls, workSelectionReadback } from '../src/work-selection.mjs';

for (const [model, effort, expectedModel, expectedEffort] of [
  ['GPT_5_6_SOL', 'MEDIUM', 'gpt-5.6-sol', 'medium'],
  ['GPT_6_ASTRA', 'LOW', 'gpt-6-astra', 'low'],
]) {
  test(`${model} ${effort} exact DOM evidence remains separate from provider observation`, () => {
    const controls = workSelectionControls({ model, effort, fastModeRequest: 'DO_NOT_ENABLE_FAST' });
    const observation = { menuFound: true, directMatchCount: 1, powerControlCount: 1, sliderCount: 1,
      thinkingLabelMatchCount: 1, thinkingControlObservedLabel: 'Thinking effort', currentPowerLabel: controls.thinkingVisibleLabel };
    const result = workSelectionReadback({ label: controls.modelVisibleLabel }, observation, controls);
    assert.deepEqual(result, { status: 'DOM_SELECTION_VERIFIED', model: expectedModel, effort: expectedEffort,
      managed_target_verified: true, fast_observed: null });
    assert.throws(() => workSelectionReadback({ label: 'wrong' }, observation, controls), /MISMATCH/);
    assert.throws(() => workSelectionReadback({ label: controls.modelVisibleLabel }, { ...observation, sliderCount: 2 }, controls), /AMBIGUOUS/);
    assert.throws(() => workSelectionControls({ model, effort, fastModeRequest: 'ENABLE_FAST' }), /UNSUPPORTED/);
  });
}
