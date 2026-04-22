/**
 * Options for the retry logic.
 */
export interface RetryOptions {
  /** Maximum number of retry attempts. */
  maxRetries: number;
  /** Initial delay in milliseconds before the first retry. */
  initialDelay: number;
  /** Callback to notify about retry progress. */
  onRetry?: (attempt: number, total: number, nextDelay: number, error: Error) => void;
  /** Optional filter to decide if an error should be retried. */
  shouldRetry?: (error: any) => boolean;
  /** Optional AbortSignal to cancel the retry loop. */
  signal?: AbortSignal;
}

/**
 * Executes an operation with exponential backoff retry logic.
 * 
 * @param operation The asynchronous operation to execute.
 * @param options Retry configuration options.
 * @returns The result of the operation.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions
): Promise<T> {
  const { maxRetries, initialDelay, onRetry, shouldRetry, signal } = options;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (signal?.aborted) {
      throw signal.reason || new Error("This operation was aborted");
    }

    try {
      return await operation();
    } catch (error: any) {
      lastError = error;

      if (attempt === maxRetries || signal?.aborted || (shouldRetry && !shouldRetry(error))) {
        throw error;
      }

      const delay = initialDelay * Math.pow(2, attempt);
      if (onRetry) {
        onRetry(attempt + 1, maxRetries, delay, error);
      }

      if (signal) {
        let timeoutId: NodeJS.Timeout;
        await Promise.race([
          new Promise((resolve) => {
            timeoutId = setTimeout(resolve, delay);
          }),
          new Promise((_, reject) => {
            const abortListener = () => {
              clearTimeout(timeoutId);
              reject(signal.reason || new Error("This operation was aborted"));
            };
            if (signal.aborted) {
              abortListener();
            } else {
              signal.addEventListener("abort", abortListener, { once: true });
            }
          }),
        ]);
      } else {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}
