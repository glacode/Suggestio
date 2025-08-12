// src/completion/debounceManager.ts
let debounceTimer: NodeJS.Timeout | undefined;

/**
 * Debounce a callback: clear any previous scheduled callback and schedule this one.
 * The callback can be async.
 */
export function debounce(callback: () => void | Promise<void>, delay: number) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    // run callback and clear timer reference when done
    (async () => {
      try {
        await callback();
      } finally {
        debounceTimer = undefined;
      }
    })();
  }, delay);
}

/** Cancel the currently scheduled debounce, if any. */
export function cancelDebounce() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
}
