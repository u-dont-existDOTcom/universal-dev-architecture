import { isTerminalControllerCycle } from './controller-mediated-pm.mjs';

export function activeControllerCycles(state) {
  return Object.values(state?.controllerCycles ?? {})
    .filter((cycle) => cycle?.cycleId && !isTerminalControllerCycle(cycle))
    .sort((left, right) => String(left.cycleId).localeCompare(String(right.cycleId)));
}

export class ControllerCycleWatchdog {
  constructor({ stateStore, controller, logger = console }) {
    if (!stateStore || typeof stateStore.read !== 'function') throw new Error('Controller watchdog requires a state store.');
    if (!controller || typeof controller.cycle !== 'function') throw new Error('Controller watchdog requires a controller runtime.');
    this.stateStore = stateStore;
    this.controller = controller;
    this.logger = logger;
    this.lastCycleId = null;
  }
  async tick() {
    const state = await this.stateStore.read();
    const active = activeControllerCycles(state);
    if (active.length === 0) {
      this.lastCycleId = null;
      return { status: 'NO_ACTIVE_CONTROLLER_CYCLES', activeCycleCount: 0, cycleId: null, result: null };
    }

    const priorIndex = this.lastCycleId ? active.findIndex((cycle) => cycle.cycleId === this.lastCycleId) : -1;
    const nextIndex = priorIndex >= 0 ? (priorIndex + 1) % active.length : 0;
    const cycle = active[nextIndex];
    this.lastCycleId = cycle.cycleId;

    try {
      const result = await this.controller.cycle(cycle.cycleId);
      return {
        status: 'CONTROLLER_WATCHDOG_ADVANCED',
        activeCycleCount: active.length,
        cycleId: cycle.cycleId,
        requestId: cycle.requestId ?? null,
        result,
      };
    } catch (error) {
      const code = error instanceof Error ? error.message : String(error);
      this.logger.error?.(JSON.stringify({ event: 'controller_watchdog_cycle_failed', cycleId: cycle.cycleId, error: code }));
      return {
        status: 'CONTROLLER_WATCHDOG_CYCLE_FAILED',
        activeCycleCount: active.length,
        cycleId: cycle.cycleId,
        requestId: cycle.requestId ?? null,
        error: code,
      };
    }
  }
}
