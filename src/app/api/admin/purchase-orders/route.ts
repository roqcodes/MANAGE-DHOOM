import { NextResponse } from "next/server";

import type {
  PurchaseOrderDeliveryFilter,
  PurchaseOrderStatusFilter,
} from "@/common/admin/types";
import {
  PURCHASE_ORDER_DELIVERY_FILTERS,
  PURCHASE_ORDER_STATUS_FILTERS,
} from "@/common/admin/types";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getPurchaseOrderCatalogStats,
  listAdminPurchaseOrders,
} from "@/modules/purchase-orders/services/admin-purchase-orders.service";

function isPoStatus(s: string | null): s is PurchaseOrderStatusFilter {
  return (
    s != null &&
    (PURCHASE_ORDER_STATUS_FILTERS as readonly string[]).includes(s)
  );
}

function isPoDeliveryFilter(s: string | null): s is PurchaseOrderDeliveryFilter {
  return (
    s != null &&
    (PURCHASE_ORDER_DELIVERY_FILTERS as readonly string[]).includes(s)
  );
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const statusRaw = searchParams.get("status")?.trim() ?? null;
  const deliveryRaw = searchParams.get("delivery")?.trim() ?? null;
  const deliveryMonthRaw = searchParams.get("deliveryMonth")?.trim() ?? null;
  const status: PurchaseOrderStatusFilter = isPoStatus(statusRaw)
    ? statusRaw
    : "all";
  const delivery: PurchaseOrderDeliveryFilter | null = isPoDeliveryFilter(
    deliveryRaw,
  )
    ? deliveryRaw
    : null;
  const rawVendor = searchParams.get("vendorId")?.trim();
  const vendorId = rawVendor && rawVendor.length > 0 ? rawVendor : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const statsOnly = searchParams.get("statsOnly") === "1";
  const includeStats = searchParams.get("includeStats") !== "false";

  if (statsOnly) {
    const stats = await getPurchaseOrderCatalogStats();
    return NextResponse.json({ stats });
  }

  const listPromise = listAdminPurchaseOrders({
    status,
    delivery,
    deliveryMonth: deliveryMonthRaw,
    page,
    vendorId,
  });

  if (!includeStats) {
    const { data, total } = await listPromise;
    return NextResponse.json({
      data,
      total,
      page,
      status,
      delivery,
      deliveryMonth: deliveryMonthRaw,
      vendorId,
    });
  }

  const [{ data, total }, stats] = await Promise.all([
    listPromise,
    getPurchaseOrderCatalogStats(),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    status,
    delivery,
    deliveryMonth: deliveryMonthRaw,
    vendorId,
    stats,
  });
}
