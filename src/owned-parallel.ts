/** The group owns every operation until it settles, including failure-triggered cancellation. */
export async function runOwnedParallel<T>(
  start: (signal: AbortSignal) => Promise<T>[],
  parent?: AbortSignal,
): Promise<T[]> {
  const controller = new AbortController();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  const operations = start(signal).map(async (operation) => {
    try {
      return await operation;
    } catch (error) {
      controller.abort();
      throw error;
    }
  });
  try {
    return await Promise.all(operations);
  } catch (error) {
    await Promise.allSettled(operations);
    throw error;
  }
}
