import { NextResponse } from "next/server";

import { requireStaffErpApiSession } from "@/lib/api/admin-api-auth";
import {
  isValidPresenceSessionKey,
  isValidPresenceTabId,
} from "@/modules/presence/lib/presence-session-key";
import {
  endPresenceSession,
  isMissingPresenceSchemaError,
  readPresenceCookie,
} from "@/modules/presence/services/presence-session.service";
import type { PresenceEndReason } from "@/modules/presence/types";

export const dynamic = "force-dynamic";

type EndBody = {
  sessionKey?: unknown;
  reason?: unknown;
  startedAt?: unknown;
  tabId?: unknown;
  generationId?: unknown;
};

/** Accepts only a parseable ISO timestamp; anything else becomes null. */
function parseStartedAt(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) {
    return null;
  }
  // Preserve fractional seconds. Converting through Date/toISOString drops
  // PostgreSQL's microseconds and can make a valid close appear stale.
  return Number.isNaN(Date.parse(value)) ? null : value;
}

export async function POST(request: Request) {
  const auth = await requireStaffErpApiSession();
  if (!auth.ok) return auth.response;

  let body: EndBody | null = null;
  try {
    body = (await request.json()) as EndBody;
  } catch {
    body = null;
  }

  const cookieKey = await readPresenceCookie();
  const sessionKey = isValidPresenceSessionKey(body?.sessionKey)
    ? body.sessionKey
    : isValidPresenceSessionKey(cookieKey)
      ? cookieKey
      : null;

  if (!sessionKey) {
    return NextResponse.json({ ok: true });
  }

  const reason: PresenceEndReason =
    body?.reason === "sign_out" ? "sign_out" : "last_tab_closed";
  const startedAt = parseStartedAt(body?.startedAt);
  const tabId = isValidPresenceTabId(body?.tabId) ? body.tabId : null;
  const generationId = isValidPresenceTabId(body?.generationId)
    ? body.generationId
    : null;

  try {
    await endPresenceSession(sessionKey, reason, startedAt, tabId, generationId);
  } catch (error) {
    if (!isMissingPresenceSchemaError(error)) {
      console.error("[presence] could not end session", error);
    }
  }

  // The browser may be unloading — never fail this request.
  return NextResponse.json({ ok: true });
}
