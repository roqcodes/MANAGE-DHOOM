import { NextResponse } from "next/server";

import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import { markMyPurchaseOrderDelivered } from "@/modules/vendor/services/vendor-purchase-orders.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    await markMyPurchaseOrderDelivered(id);

    return NextResponse.json({
      ok: true,
      message: "Purchase order fulfilled successfully. Stock has been added to inventory.",
    });
  } catch (error) {
    console.error("Error fulfilling vendor PO:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to fulfill purchase order" },
      { status: 500 },
    );
  }
}
