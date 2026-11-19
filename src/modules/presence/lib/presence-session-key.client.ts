"use client";

import {
  PRESENCE_SESSION_KEY_STORAGE,
  createPresenceSessionKey,
  isValidPresenceSessionKey,
} from "@/modules/presence/lib/presence-session-key";

const PRESENCE_TAB_ID_STORAGE = "buyhub:presence-tab-id:v1";

export function createPresenceGenerationId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* use fallback */
  }
  return `gen_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreatePresenceTabId(): string {
  try {
    const existing = window.sessionStorage.getItem(PRESENCE_TAB_ID_STORAGE);
    if (existing && /^[A-Za-z0-9_-]{8,128}$/.test(existing)) return existing;

    const tabId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(PRESENCE_TAB_ID_STORAGE, tabId);
    return tabId;
  } catch {
    return `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * One key per browser, shared by every tab. Stored in localStorage so the
 * server can scope a single `user_sessions` row to this browser. The key is
 * not a secret: every RPC still scopes writes to `auth.uid()`.
 */
export async function getOrCreatePresenceSessionKey(): Promise<string> {
  if (typeof window === "undefined") return createPresenceSessionKey();

  const readOrCreate = () => {
    try {
      const existing = window.localStorage.getItem(PRESENCE_SESSION_KEY_STORAGE);
      if (isValidPresenceSessionKey(existing)) return existing;

      const key = createPresenceSessionKey();
      window.localStorage.setItem(PRESENCE_SESSION_KEY_STORAGE, key);
      return key;
    } catch {
      // Private mode / blocked storage: fall back to an in-memory key.
      return createPresenceSessionKey();
    }
  };

  // Serialize first-load key creation across tabs where the browser supports
  // Web Locks. This prevents concurrent tabs creating separate history rows.
  if (navigator.locks) {
    return navigator.locks.request(
      "buyhub:presence-session-key",
      { mode: "exclusive" },
      readOrCreate,
    );
  }

  return readOrCreate();
}
