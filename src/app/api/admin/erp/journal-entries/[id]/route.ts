import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getJournalEntryDetail } from "@/modules/erp/services/erp-journal.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const data = await getJournalEntryDetail(id);
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "Failed to get journal" }, { status: 500 });
  }
}
