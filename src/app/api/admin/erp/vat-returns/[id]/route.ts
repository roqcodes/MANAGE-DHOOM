import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  deleteVatReturn,
  fileVatReturn,
  getVatReturnDetail,
  refreshVatReturn,
} from "@/modules/erp/services/erp-vat.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  try {
    const data = await getVatReturnDetail(id);
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load VAT return";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  try {
    const body = await request.json();
    if (body.action === "file") {
      await fileVatReturn(id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "refresh") {
      const data = await refreshVatReturn(id);
      return NextResponse.json(data);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update VAT return";
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
    await deleteVatReturn(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to delete VAT return";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
