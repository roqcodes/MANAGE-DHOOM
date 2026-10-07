import {
  SYNC_MAX_ATTEMPTS,
  SYNC_RETRY_BASE_MS,
  SYNC_RETRY_MAX_MS,
} from "@/lib/sync/sync-types";

export function computeNextRetryAt(attempts: number, now: number): number {
  const exponent = Math.max(0, attempts - 1);
  const delay = Math.min(
    SYNC_RETRY_MAX_MS,
    SYNC_RETRY_BASE_MS * 2 ** exponent,
  );
  const jitter = Math.floor(Math.random() * delay * 0.3);
  return now + delay + jitter;
}

export function hasRetriesRemaining(attempts: number): boolean {
  return attempts < SYNC_MAX_ATTEMPTS;
}
