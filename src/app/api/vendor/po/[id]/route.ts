import { NextResponse } from "next/server";

import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import { getMyPurchaseOrderById } from "@/modules/vendor/services/vendor-purchase-orders.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const po = await getMyPurchaseOrderById(id);

    if (!po) {
      return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });
    }

    return NextResponse.json({ po });
  } catch (error) {
    console.error("Error fetching vendor PO:", error);
    return NextResponse.json(
      { error: "Failed to fetch purchase order" },
      { status: 500 },
    );
  }
}
