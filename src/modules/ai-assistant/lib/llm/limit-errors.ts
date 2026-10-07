export function parseErrorMessage(detail: string): string {
  try {
    const parsed = JSON.parse(detail) as {
      error?: {
        message?: string;
        code?: string | number;
        type?: string;
        metadata?: { raw?: string };
      };
      message?: string;
    };
    return (
      parsed.error?.metadata?.raw ||
      parsed.error?.message ||
      parsed.message ||
      detail.slice(0, 400)
    );
  } catch {
    return detail.slice(0, 400);
  }
}

/** True when we should try the next model or provider (quota / rate limit / overload). */
export function isLimitOrOverloadError(
  status: number,
  message: string,
): boolean {
  if (
    status === 429 ||
    status === 402 ||
    status === 404 ||
    status === 503 ||
    status === 529
  ) {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    /rate.?limit|too many requests|quota|resource.?exhausted|capacity|overloaded|temporarily unavailable|tokens per minute|requests per minute|limit:\s*0|model.*not found|invalid model|is not supported/i.test(
      lower,
    ) ||
    /RESOURCE_EXHAUSTED|RATE_LIMIT|QUOTA_EXCEEDED/i.test(message)
  );
}

export function isAbortTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" ||
      /aborted due to timeout|timed out/i.test(error.message))
  );
}
