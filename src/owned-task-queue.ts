import { abortError } from "./errors.js";

/** Process-wide heavy-provider admission. Cancelling queued work does not overtake its predecessor. */
export class OwnedTaskQueue {
  #tail: Promise<void> = Promise.resolve();
  async run<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw abortError();
    const previous = this.#tail;
    const completed = Promise.withResolvers<void>();
    this.#tail = previous.then(() => completed.promise);
    const cancelled = Promise.withResolvers<never>();
    const abort = () => cancelled.reject(abortError());
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      await Promise.race([previous, cancelled.promise]);
      if (signal?.aborted) throw abortError();
      return await operation();
    } finally {
      signal?.removeEventListener("abort", abort);
      completed.resolve();
    }
  }
}
