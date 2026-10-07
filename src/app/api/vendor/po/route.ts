import { NextResponse } from "next/server";

import type { VendorPoStatusFilter } from "@/modules/vendor/types";
import { VENDOR_PO_STATUS_FILTERS } from "@/modules/vendor/types";
import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import {
  listMyPurchaseOrders,
  getMyPurchaseOrderStats,
} from "@/modules/vendor/services/vendor-purchase-orders.service";

function isPoStatus(s: string | null): s is VendorPoStatusFilter {
  return (
    s != null &&
    (VENDOR_PO_STATUS_FILTERS as readonly string[]).includes(s)
  );
}

export async function GET(request: Request) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status")?.trim() ?? null;
  const status: VendorPoStatusFilter = isPoStatus(statusRaw)
    ? statusRaw
    : "pending";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  const [{ data, total }, stats] = await Promise.all([
    listMyPurchaseOrders(status, page),
    getMyPurchaseOrderStats(),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    status,
    stats,
  });
}
