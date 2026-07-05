export interface RetryConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  strategy?: "fixed" | "linear" | "exponential";
  jitter?: boolean;
  retryOn?: (error: any) => boolean; // decide whether an error is retryable
  onRetry?: (attempt: number, error: any, delayMs: number) => void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function computeDelay(attempt: number, config: Required<Pick<RetryConfig, "baseDelayMs" | "maxDelayMs" | "strategy" | "jitter">>): number {
  let delay: number;
  switch (config.strategy) {
    case "fixed":
      delay = config.baseDelayMs;
      break;
    case "linear":
      delay = config.baseDelayMs * attempt;
      break;
    case "exponential":
    default:
      delay = config.baseDelayMs * 2 ** (attempt - 1);
      break;
  }
  delay = Math.min(delay, config.maxDelayMs);
  if (config.jitter) {
    delay = Math.random() * delay;
  }
  return Math.round(delay);
}

/**
 * Retry an async function with configurable backoff (fixed, linear, or
 * exponential), optional jitter, and a predicate to decide which errors
 * are worth retrying.
 */
export async function retry<T>(fn: (attempt: number) => Promise<T>, config: RetryConfig = {}): Promise<T> {
  const maxAttempts = config.maxAttempts ?? 3;
  const baseDelayMs = config.baseDelayMs ?? 200;
  const maxDelayMs = config.maxDelayMs ?? 10_000;
  const strategy = config.strategy ?? "exponential";
  const jitter = config.jitter ?? true;
  const retryOn = config.retryOn ?? (() => true);

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const isLastAttempt = attempt === maxAttempts;
      if (isLastAttempt || !retryOn(err)) {
        throw err;
      }
      const delay = computeDelay(attempt, { baseDelayMs, maxDelayMs, strategy, jitter });
      config.onRetry?.(attempt, err, delay);
      await sleep(delay);
    }
  }

  throw lastError;
}

/** Class-based wrapper for cases where a reusable, pre-configured retrier is handy */
export class Retrier {
  constructor(private config: RetryConfig = {}) {}

  run<T>(fn: (attempt: number) => Promise<T>): Promise<T> {
    return retry(fn, this.config);
  }
}
