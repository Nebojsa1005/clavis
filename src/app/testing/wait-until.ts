/**
 * Polls until `condition` holds. For tests that wait on IndexedDB, whose callbacks Angular's
 * `whenStable()` does not track.
 */
export async function waitUntil(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error('waitUntil: condition was not met in time');
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
