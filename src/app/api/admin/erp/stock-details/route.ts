import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getStockDetails } from "@/modules/erp/services/erp-stock-details.service";
import { getTransferStatement } from "@/modules/erp/services/erp-store-transfers.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const view = url.searchParams.get("view");

  if (view === "statement") {
    try {
      const lines = await getTransferStatement({
        fromStoreId: url.searchParams.get("fromStoreId") ?? "",
        toStoreId: url.searchParams.get("toStoreId"),
        fromDate: url.searchParams.get("fromDate"),
        toDate: url.searchParams.get("toDate"),
      });
      return NextResponse.json({ lines });
    } catch {
      return NextResponse.json({ error: "Failed to get statement" }, { status: 500 });
    }
  }

  const page = Math.max(0, parseInt(url.searchParams.get("page") ?? "0", 10));
  const storeId = url.searchParams.get("storeId") ?? undefined;
  try {
    const result = await getStockDetails({ page, storeId });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to get stock details" }, { status: 500 });
  }
}
