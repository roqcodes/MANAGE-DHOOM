import { NextResponse } from "next/server";

import { requireStaffErpApiSession } from "@/lib/api/admin-api-auth";
import {
  createPresenceSessionKey,
  isValidPresenceSessionKey,
  isValidPresenceTabId,
} from "@/modules/presence/lib/presence-session-key";
import {
  isMissingPresenceSchemaError,
  startPresenceSession,
  writePresenceCookie,
} from "@/modules/presence/services/presence-session.service";

export const dynamic = "force-dynamic";

type StartBody = {
  sessionKey?: unknown;
  tabId?: unknown;
  generationId?: unknown;
};

export async function POST(request: Request) {
  const auth = await requireStaffErpApiSession();
  if (!auth.ok) return auth.response;

  let body: StartBody | null = null;
  try {
    body = (await request.json()) as StartBody;
  } catch {
    body = null;
  }

  const sessionKey = isValidPresenceSessionKey(body?.sessionKey)
    ? body.sessionKey
    : createPresenceSessionKey();
  const tabId = isValidPresenceTabId(body?.tabId)
    ? body.tabId
    : createPresenceSessionKey();
  const generationId = isValidPresenceTabId(body?.generationId)
    ? body.generationId
    : createPresenceSessionKey();

  try {
    // Mirror the key into an HttpOnly cookie so the sign-out server action can
    // close the same row without relying on the browser.
    await writePresenceCookie(sessionKey);

    const userAgent = request.headers.get("user-agent")?.slice(0, 300) ?? null;
    const startedAt = await startPresenceSession(
      sessionKey,
      userAgent,
      tabId,
      generationId,
    );

    return NextResponse.json({ ok: true, startedAt });
  } catch (error) {
    if (isMissingPresenceSchemaError(error)) {
      console.warn("[presence] session schema is not migrated; skipping start");
      return NextResponse.json({ ok: true, tracked: false });
    }

    console.error("[presence] could not start session", error);
    return NextResponse.json(
      { error: "Could not start session." },
      { status: 500 },
    );
  }
}
