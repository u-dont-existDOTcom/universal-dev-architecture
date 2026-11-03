/** Scheduler-owned deadline. The operation must implement actual resource cancellation.
 * The deadline is measured on the monotonic clock (performance.now()), so a wall-clock adjustment can neither extend
 * nor shorten it. The operation receives (signal, deadline): its remaining budget is deadline - performance.now(). */
export class DeadlineExceeded extends Error {
  constructor() { super('Operation deadline exceeded'); this.name = 'DeadlineExceeded'; this.code = 'timeout'; }
}

export async function runWithDeadline(operation, { timeoutMs }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new RangeError('timeoutMs must be a positive bounded integer');
  }
  const controller = new AbortController();
  const deadline = performance.now() + timeoutMs;
  let rejectExpired;
  const expired = new Promise((_, reject) => { rejectExpired = reject; });
  // One idempotent expiry, used by the timer and by the late check after the operation returns, so a timer that fires
  // late (a blocked event loop) still aborts the resource. It settles the caller first, then aborts the resource.
  const expire = () => {
    if (controller.signal.aborted) return controller.signal.reason;
    const error = new DeadlineExceeded();
    rejectExpired(error);
    controller.abort(error);
    return error;
  };
  const timer = setTimeout(expire, timeoutMs);
  const work = async () => {
    const value = await operation(controller.signal, deadline);
    if (controller.signal.aborted || performance.now() >= deadline) throw expire();
    return value;
  };
  try { return await Promise.race([work(), expired]); }
  finally { clearTimeout(timer); }
}
