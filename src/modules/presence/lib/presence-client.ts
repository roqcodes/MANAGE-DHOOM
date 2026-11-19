"use client";

import type { PresenceEndReason } from "@/modules/presence/types";

const START_ENDPOINT = "/api/admin/presence/start";
const HEARTBEAT_ENDPOINT = "/api/admin/presence/heartbeat";
const END_ENDPOINT = "/api/admin/presence/end";

/** Server timestamp for this tab's latest successful start. */
const PRESENCE_STARTED_AT_STORAGE = "buyhub:presence-started-at:v1";

function serverTimestampMicros(value: string): number | null {
  const epochMs = Date.parse(value);
  if (Number.isNaN(epochMs)) return null;

  // Date.parse keeps only milliseconds; retain PostgreSQL's remaining
  // microseconds so near-simultaneous tab starts still compare correctly.
  const fraction = value.match(/\.(\d+)/)?.[1] ?? "";
  const fractionMicros = fraction.padEnd(6, "0").slice(0, 6);
  const extraMicros = Number(fractionMicros.slice(3));
  return epochMs * 1000 + extraMicros;
}

function rememberPresenceStartedAt(startedAt: string) {
  try {
    const current = window.sessionStorage.getItem(PRESENCE_STARTED_AT_STORAGE);
    // Replayed starts can resolve out of order within one tab.
    const currentMicros = current ? serverTimestampMicros(current) : null;
    const startedMicros = serverTimestampMicros(startedAt);
    if (
      currentMicros !== null &&
      startedMicros !== null &&
      currentMicros > startedMicros
    ) {
      return;
    }
    window.sessionStorage.setItem(PRESENCE_STARTED_AT_STORAGE, startedAt);
  } catch {
    /* storage unavailable — the server safely ignores an unscoped close */
  }
}

function readPresenceStartedAt(): string | null {
  try {
    return window.sessionStorage.getItem(PRESENCE_STARTED_AT_STORAGE);
  } catch {
    return null;
  }
}

/**
 * Best-effort session start. Presence works even when this call fails, so the
 * UI never surfaces an error for it.
 */
export async function startTeamPresenceSession(
  sessionKey: string,
  tabId: string,
  generationId: string,
): Promise<string | null> {
  try {
    const response = await fetch(START_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey, tabId, generationId }),
      keepalive: true,
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { startedAt?: unknown };
    const startedAt =
      typeof payload.startedAt === "string" ? payload.startedAt : null;

    if (startedAt) rememberPresenceStartedAt(startedAt);
    return startedAt;
  } catch {
    /* history only — live presence is unaffected */
    return null;
  }
}

/**
 * Lightweight heartbeat to maintain active session state and prevent
 * premature stale timeout.
 */
export async function pingTeamPresenceSession(
  sessionKey: string,
  tabId: string,
  generationId: string,
): Promise<boolean> {
  try {
    const response = await fetch(HEARTBEAT_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey, tabId, generationId }),
    });

    if (!response.ok) return false;
    const payload = (await response.json()) as { ok?: boolean; alive?: boolean };
    return payload.ok === true;
  } catch {
    return false;
  }
}

/**
 * `sendBeacon` is the reliable way to fire a request while a page unloads.
 * Falls back to `fetch(..., { keepalive: true })` when beacons are unavailable.
 *
 * The per-tab timestamp prevents an old page or another tab from closing a
 * newer start. The server rejects a close without this value.
 */
export function sendTeamPresenceEndBeacon(
  sessionKey: string,
  reason: PresenceEndReason,
  tabId: string,
  generationId: string,
): void {
  const body = JSON.stringify({
    sessionKey,
    reason,
    tabId,
    generationId,
    startedAt: readPresenceStartedAt(),
  });

  try {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.sendBeacon === "function"
    ) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(END_ENDPOINT, blob)) return;
    }
  } catch {
    /* fall through to fetch */
  }

  try {
    void fetch(END_ENDPOINT, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    });
  } catch {
    /* best effort */
  }
}
