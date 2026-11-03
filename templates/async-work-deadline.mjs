/** Scheduler-owned deadline. The operation must implement actual resource cancellation. */
export class DeadlineExceeded extends Error {
  constructor() { super('Operation deadline exceeded'); this.name = 'DeadlineExceeded'; this.code = 'timeout'; }
}

export async function runWithDeadline(operation, { timeoutMs }) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new RangeError('timeoutMs must be a positive bounded integer');
  }
  const controller = new AbortController();
  const deadline = Date.now() + timeoutMs;
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new DeadlineExceeded();
      // Settle independently of whether the resource emits a terminal event.
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });
  const work = async () => {
    const value = await operation(controller.signal, deadline);
    if (controller.signal.aborted || Date.now() >= deadline) throw new DeadlineExceeded();
    return value;
  };
  try { return await Promise.race([work(), expired]); }
  finally { clearTimeout(timer); }
}
