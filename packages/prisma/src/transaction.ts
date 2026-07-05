import { PrismaClientLike } from "./delegate";

export interface TransactionRetryConfig {
  maxAttempts?: number;
  retryDelayMs?: number;
  /** Prisma error codes worth retrying — defaults cover common serialization/deadlock conflicts */
  retryableErrorCodes?: string[];
}

const DEFAULT_RETRYABLE_CODES = ["P2034"]; // Prisma: Transaction failed due to a write conflict or a deadlock

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a function inside a Prisma transaction, automatically retrying on
 * transient conflicts (write skew / deadlocks) with a short backoff —
 * useful under concurrent load where two transactions race for the same rows.
 */
export async function runTransaction<T>(
  prisma: PrismaClientLike,
  fn: (tx: any) => Promise<T>,
  config: TransactionRetryConfig = {}
): Promise<T> {
  const maxAttempts = config.maxAttempts ?? 3;
  const retryDelayMs = config.retryDelayMs ?? 100;
  const retryableCodes = config.retryableErrorCodes ?? DEFAULT_RETRYABLE_CODES;

  let lastError: any;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(fn);
    } catch (err: any) {
      lastError = err;
      const isRetryable = retryableCodes.includes(err?.code);
      if (!isRetryable || attempt === maxAttempts) throw err;
      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError;
}
