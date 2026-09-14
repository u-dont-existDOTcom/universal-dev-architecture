// UI labels are selectors, not provider identity attestations. Ambiguity blocks sending.
export function workSelectionControls(profile) {
  const models = { GPT_5_6_SOL: ['gpt-5.6-sol', 'GPT-5.6 Sol'], GPT_6_ASTRA: ['gpt-6-astra', 'GPT-6 Astra'] };
  const efforts = { LOW: ['low', 'Low'], MEDIUM: ['medium', 'Medium'], HIGH: ['high', 'High'], XHIGH: ['xhigh', 'Extra High'], MAX: ['max', 'Max'] };
  const model = models[profile?.model];
  const effort = efforts[profile?.effort];
  if (!model || !effort || profile.fastModeRequest !== 'DO_NOT_ENABLE_FAST') throw new Error('WORK_UI_PROFILE_UNSUPPORTED');
  return { model: model[0], effort: effort[0], modelVisibleLabel: model[1], thinkingVisibleLabel: effort[1], thinkingControlLabel: 'Thinking effort' };
}

export function workSelectionReadback(current, observation, controls) {
  if (!observation?.menuFound || observation.directMatchCount !== 1
    || observation.powerControlCount !== 1 || observation.sliderCount !== 1
    || observation.thinkingLabelMatchCount !== 1
    || observation.thinkingControlObservedLabel !== controls.thinkingControlLabel)
    throw new Error('WORK_UI_SELECTION_AMBIGUOUS');
  if (current?.label !== controls.modelVisibleLabel || observation.currentPowerLabel !== controls.thinkingVisibleLabel)
    throw new Error('WORK_UI_SELECTION_MISMATCH');
  return { status: 'DOM_SELECTION_VERIFIED', model: controls.model, effort: controls.effort,
    managed_target_verified: true, fast_observed: null };
}
