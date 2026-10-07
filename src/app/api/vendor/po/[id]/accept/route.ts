import { NextResponse } from "next/server";

import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import { acceptMyPurchaseOrder } from "@/modules/vendor/services/vendor-purchase-orders.service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    await acceptMyPurchaseOrder(id);

    return NextResponse.json({
      ok: true,
      message: "Purchase order accepted successfully",
    });
  } catch (error) {
    console.error("Error accepting vendor PO:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to accept purchase order" },
      { status: 500 },
    );
  }
}
