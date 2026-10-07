import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  applyCreditNoteToInvoice,
  deleteDraftCreditNote,
  finalizeCreditNote,
  getCreditNoteDetail,
  updateDraftCreditNote,
} from "@/modules/erp/services/erp-credit-notes.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const creditNote = await getCreditNoteDetail(id);
    return NextResponse.json(creditNote);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load credit note";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.invoiceId) {
      await applyCreditNoteToInvoice(id, body.invoiceId, body.amount);
    } else {
      await finalizeCreditNote(id, { restoreStock: body.restoreStock ?? false });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to process credit note";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json();
    await updateDraftCreditNote(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update credit note";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  try {
    await deleteDraftCreditNote(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete credit note";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
