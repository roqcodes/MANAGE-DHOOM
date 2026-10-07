import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { runRecurringSchedule } from "@/modules/erp/services/erp-recurring.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await context.params;
    const createdId = await runRecurringSchedule(id);
    return NextResponse.json({ createdId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Run failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
