import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getJournalGroupsForSource } from "@/modules/erp/services/erp-journal.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }

  try {
    const groups = await getJournalGroupsForSource(entityType, entityId);
    const lines = groups.flatMap((group) => group.lines);
    return NextResponse.json({ groups, lines });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load journals";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
