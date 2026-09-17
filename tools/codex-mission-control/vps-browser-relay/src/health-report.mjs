export async function observeRelayHealth({ doctor, browserDoctor, schedulerStatus, now = () => new Date() }) {
  try {
    return await doctor();
  } catch (error) {
    try {
      await browserDoctor();
    } catch {
      const centralScheduler = await schedulerStatus();
      return {
        status: 'HOST_BROWSER_UNAVAILABLE',
        checkedAt: now().toISOString(),
        centralScheduler,
        browser: {
          webSocketDebuggerUrlPresent: false,
          automationWindowOwnershipEnforced: false,
          automationWindowId: null,
          automationOwnedTabCount: 0,
          automationOwnedTargetIdsSha256: null,
        },
      };
    }
    throw error;
  }
}

export function buildRelayHealthReport(config, doctor) {
  const binding = doctor.centralScheduler?.authenticatedRelayBinding;
  const browser = doctor.browser ?? {};
  const authorityBindingState = Number.isInteger(browser.automationWindowId)
    && browser.automationWindowId === binding?.automationWindowId
    && browser.automationOwnedTabCount === binding?.ownedTargetCount
    && browser.automationOwnedTargetIdsSha256 === binding?.ownedTargetIdsSha256
    ? 'BOUND'
    : binding ? 'MISMATCH' : 'UNAVAILABLE';
  const browserState = browser.webSocketDebuggerUrlPresent === true
    && browser.automationWindowOwnershipEnforced === true
    && authorityBindingState === 'BOUND'
    ? 'HEALTHY'
    : browser.webSocketDebuggerUrlPresent === true ? 'DEGRADED' : 'UNAVAILABLE';
  const healthyRelayStates = new Set(['READY', 'CENTRAL_AUTHORITY_NOT_READY', 'STANDBY_READY']);
  const relayWorkerState = healthyRelayStates.has(doctor.status)
    ? 'HEALTHY'
    : doctor.status ? 'DEGRADED' : 'UNAVAILABLE';
  return {
    schemaVersion: 1,
    hostAlias: config.runtime.submissionHost.alias,
    hostRole: config.runtime.submissionHost.role,
    deploymentEpoch: config.runtime.submissionHost.deploymentEpoch,
    observedAt: doctor.checkedAt,
    relayWorkerState,
    browserState,
    authorityBindingState,
    detail: privacySafeStatus(doctor.status),
  };
}

function privacySafeStatus(value) {
  return typeof value === 'string' && /^[A-Z0-9_ -]{1,120}$/.test(value)
    ? value
    : 'UNAVAILABLE';
}
