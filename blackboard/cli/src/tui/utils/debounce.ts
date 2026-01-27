/**
 * Debounce utility for delaying function execution until after a period of inactivity.
 * Useful for expensive operations like terminal resize handling.
 */

export interface DebounceOptions {
  /**
   * Delay in milliseconds to wait before executing the function.
   * Default: 250ms
   */
  delayMs?: number;

  /**
   * Whether to execute the function on the leading edge (immediately on first call).
   * Default: false (trailing edge only)
   */
  leading?: boolean;
}

/**
 * Create a debounced function that delays execution until after delayMs have elapsed
 * since the last time it was invoked.
 *
 * @param fn The function to debounce
 * @param options Debounce configuration
 * @returns A debounced version of the function with a cancel() method
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  options: DebounceOptions = {}
): T & { cancel: () => void } {
  const { delayMs = 250, leading = false } = options;

  let timeoutId: number | null = null;
  let lastCallTime = 0;

  const debounced = function (this: unknown, ...args: unknown[]) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCallTime;

    // Clear existing timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Leading edge: execute immediately if enough time has passed
    if (leading && timeSinceLastCall >= delayMs) {
      lastCallTime = now;
      fn.apply(this, args);
      return;
    }

    // Trailing edge: schedule execution
    timeoutId = setTimeout(() => {
      lastCallTime = Date.now();
      timeoutId = null;
      fn.apply(this, args);
    }, delayMs);
  };

  // Add cancel method to clear pending executions
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debounced as T & { cancel: () => void };
}
