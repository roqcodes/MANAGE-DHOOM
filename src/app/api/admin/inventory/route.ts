import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getInventory,
  getInventoryCatalogStats,
} from "@/modules/inventory/services/inventory.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const storeId = searchParams.get("storeId") ?? undefined;
  const [{ data, total }, stats] = await Promise.all([
    getInventory(page, storeId),
    getInventoryCatalogStats(storeId),
  ]);

  return NextResponse.json({ data, total, page, stats });
}
