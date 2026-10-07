import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createManualJournalEntry, listJournalEntries } from "@/modules/erp/services/erp-journal.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const storeId = url.searchParams.get("storeId") ?? undefined;
  try {
    const result = await listJournalEntries(page, 30, storeId);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to list journals" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createManualJournalEntry(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create journal";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
