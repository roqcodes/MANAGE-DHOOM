import { NextResponse } from "next/server";

import { requireAdminApiPageRead } from "@/lib/api/admin-api-auth";
import {
  PRESENCE_HISTORY_DAYS,
  PRESENCE_HISTORY_LIMIT,
} from "@/modules/presence/lib/presence-constants";
import {
  getPresenceSessions,
  isMissingPresenceSchemaError,
} from "@/modules/presence/services/presence-session.service";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAdminApiPageRead("/admin/users/online");
  if (!auth.ok) return auth.response;

  try {
    const sessions = await getPresenceSessions(
      PRESENCE_HISTORY_DAYS,
      PRESENCE_HISTORY_LIMIT,
    );

    return NextResponse.json({ sessions, days: PRESENCE_HISTORY_DAYS });
  } catch (error) {
    if (isMissingPresenceSchemaError(error)) {
      console.warn(
        "[presence] session schema is not migrated; returning empty history",
      );
      return NextResponse.json({ sessions: [], days: PRESENCE_HISTORY_DAYS });
    }

    console.error("[presence] could not load session history", error);
    return NextResponse.json(
      { error: "Could not load login history." },
      { status: 500 },
    );
  }
}
