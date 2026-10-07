import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createCreditNote, listCreditNotes } from "@/modules/erp/services/erp-credit-notes.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  try {
    const result = await listCreditNotes(page, 20, {
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      storeId: searchParams.get("storeId") ?? undefined,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/admin/erp/credit-notes]", error);
    return NextResponse.json({ error: "Failed to list credit notes" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const id = await createCreditNote(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to create credit note";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
