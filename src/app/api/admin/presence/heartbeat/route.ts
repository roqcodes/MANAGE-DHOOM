import { NextResponse } from "next/server";

import { requireStaffErpApiSession } from "@/lib/api/admin-api-auth";
import {
  isValidPresenceSessionKey,
  isValidPresenceTabId,
} from "@/modules/presence/lib/presence-session-key";
import {
  isMissingPresenceSchemaError,
  pingPresenceSession,
  readPresenceCookie,
} from "@/modules/presence/services/presence-session.service";

export const dynamic = "force-dynamic";

type HeartbeatBody = {
  sessionKey?: unknown;
  tabId?: unknown;
  generationId?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireStaffErpApiSession();
  if (!auth.ok) return auth.response;

  let body: HeartbeatBody | null = null;
  try {
    body = (await request.json()) as HeartbeatBody;
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
    return NextResponse.json({ ok: false, error: "missing_session_key" }, { status: 400 });
  }

  const tabId = isValidPresenceTabId(body?.tabId) ? body.tabId : null;
  const generationId = isValidPresenceTabId(body?.generationId)
    ? body.generationId
    : null;

  try {
    const alive = await pingPresenceSession(sessionKey, tabId, generationId);
    return NextResponse.json({ ok: true, alive });
  } catch (error) {
    if (isMissingPresenceSchemaError(error)) {
      return NextResponse.json({ ok: true, alive: true, fallback: true });
    }

    console.warn("[presence] heartbeat ping failed", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
