import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import type { CommercialDiscountSide } from "@/common/erp/commercial-discount";
import { nullIfEmptyDate } from "@/lib/format-date";
import {
  listCommercialDiscountAccounts,
  recordCommercialDiscount,
} from "@/modules/erp/services/erp-commercial-discount.service";

function parseSide(value: string | null): CommercialDiscountSide | null {
  if (value === "supplier" || value === "customer") return value;
  return null;
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view");
  const side = parseSide(searchParams.get("side"));
  const storeId = searchParams.get("storeId") ?? undefined;

  if (view === "accounts") {
    if (!side) {
      return NextResponse.json({ error: "side must be supplier or customer" }, { status: 400 });
    }
    try {
      const accounts = await listCommercialDiscountAccounts(side, storeId);
      return NextResponse.json({ data: accounts });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load discount accounts";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown view" }, { status: 400 });
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = await request.json();
    const side = parseSide(typeof body.side === "string" ? body.side : null);
    if (!side) {
      return NextResponse.json({ error: "side must be supplier or customer" }, { status: 400 });
    }
    const result = await recordCommercialDiscount({
      side,
      partyId: String(body.partyId ?? ""),
      storeId: typeof body.storeId === "string" ? body.storeId : undefined,
      discountDate:
        nullIfEmptyDate(typeof body.discountDate === "string" ? body.discountDate : null) ??
        new Date().toISOString().slice(0, 10),
      amount: Number(body.amount ?? 0),
      taxRatePercent: body.taxRatePercent != null ? Number(body.taxRatePercent) : 0,
      sourceDocumentId: body.sourceDocumentId ? String(body.sourceDocumentId) : null,
      discountAccountId: body.discountAccountId ? String(body.discountAccountId) : null,
      reference: typeof body.reference === "string" ? body.reference : undefined,
      notes: typeof body.notes === "string" ? body.notes : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to record discount";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
