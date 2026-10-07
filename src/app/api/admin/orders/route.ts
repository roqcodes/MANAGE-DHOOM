import { NextResponse } from "next/server";

import type { OrderStatusFilter } from "@/common/admin/types";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getOrders,
  getOrdersCatalogStats,
  type OrderChannel,
} from "@/modules/orders/services/orders.service";

function parseChannel(raw: string | null): OrderChannel {
  return raw === "erp" ? "erp" : "online";
}

const STATUSES: OrderStatusFilter[] = [
  "all",
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function parseStatus(s: string | null): OrderStatusFilter {
  if (s && (STATUSES as string[]).includes(s)) return s as OrderStatusFilter;
  return "all";
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = parseStatus(searchParams.get("status"));
  const rawUser = searchParams.get("userId")?.trim();
  const userId = rawUser && rawUser.length > 0 ? rawUser : null;
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));
  const channel = parseChannel(searchParams.get("channel"));

  const [{ data, total }, stats] = await Promise.all([
    getOrders(status, userId, page, channel),
    getOrdersCatalogStats(channel),
  ]);

  return NextResponse.json({
    data,
    total,
    page,
    status,
    userId,
    filterUsers: [],
    stats,
  });
}
