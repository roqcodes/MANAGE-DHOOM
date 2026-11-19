/** Session key helpers shared by the browser and the server routes. */

export const PRESENCE_SESSION_KEY_STORAGE = "buyhub:presence-session-key:v1";

const PRESENCE_SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export function isValidPresenceSessionKey(value: unknown): value is string {
  return typeof value === "string" && PRESENCE_SESSION_KEY_PATTERN.test(value);
}

export function isValidPresenceTabId(value: unknown): value is string {
  return typeof value === "string" && PRESENCE_SESSION_KEY_PATTERN.test(value);
}

export function createPresenceSessionKey(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the timestamp-based key */
  }

  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}
