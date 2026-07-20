const LIVE_PROOF_RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 12_000, 16_000, 18_000] as const;


type RetryOptions<T> = {
  request: () => Promise<T>;
  retryDelaysMs?: readonly number[];
  wait?: (delayMs: number, signal?: AbortSignal) => Promise<void>;
  signal?: AbortSignal;
  onRetry?: () => void;
};


function waitForRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Request aborted", "AbortError"));
    };

    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}


export async function loadSummaryWithRetry<T>({
  request,
  retryDelaysMs = LIVE_PROOF_RETRY_DELAYS_MS,
  wait = waitForRetry,
  signal,
  onRetry,
}: RetryOptions<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
      const delayMs = retryDelaysMs[attempt];
      if (delayMs === undefined) break;
      onRetry?.();
      await wait(delayMs, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Live summary unavailable");
}
