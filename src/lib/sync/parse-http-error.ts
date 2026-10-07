/** Extract a human-readable message from admin API JSON error bodies. */
export function parseHttpErrorMessage(bodyText: string): string | null {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as {
      error?: unknown;
      message?: unknown;
      code?: unknown;
    };
    if (typeof parsed.error === "string" && parsed.error.length > 0) {
      return parsed.error;
    }
    if (typeof parsed.message === "string" && parsed.message.length > 0) {
      return parsed.message;
    }
  } catch {
    /* not JSON */
  }
  if (trimmed.length <= 400) {
    return trimmed;
  }
  return `${trimmed.slice(0, 400)}…`;
}
