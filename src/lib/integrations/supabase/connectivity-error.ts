/** Detect undici / fetch failures reaching Supabase (timeouts, offline, DNS). */
export function isSupabaseConnectivityError(error: unknown): boolean {
  if (!error) return false;

  if (error instanceof TypeError && error.message === "fetch failed") {
    return true;
  }

  const err = error as Error & {
    cause?: { code?: string; message?: string };
  };

  const causeCode = err.cause?.code ?? "";
  if (
    causeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    causeCode === "UND_ERR_SOCKET" ||
    causeCode === "UND_ERR_HEADERS_TIMEOUT"
  ) {
    return true;
  }

  const combined = `${err.message} ${err.cause?.message ?? ""}`.toLowerCase();
  return combined.includes("fetch failed") || combined.includes("connect timeout");
}

export class SupabaseConnectivityError extends Error {
  constructor(cause?: unknown) {
    super("Could not reach the server. Check your network and try again.");
    this.name = "SupabaseConnectivityError";
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export function rethrowIfConnectivityError(error: unknown): never {
  if (isSupabaseConnectivityError(error)) {
    throw new SupabaseConnectivityError(error);
  }
  throw error;
}
