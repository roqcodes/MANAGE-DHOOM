import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  listFulfillmentQueue,
  type FulfillmentQueueFilter,
} from "@/modules/orders/services/order-fulfillment.service";

const VALID_FILTERS: FulfillmentQueueFilter[] = [
  "needs_assignment",
  "ready_to_ship",
  "all_open",
];

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const rawFilter = searchParams.get("filter") ?? "needs_assignment";
  const filter = VALID_FILTERS.includes(rawFilter as FulfillmentQueueFilter)
    ? (rawFilter as FulfillmentQueueFilter)
    : "needs_assignment";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  try {
    const result = await listFulfillmentQueue(filter, page);
    return NextResponse.json({
      ...result,
      page,
      filter,
    });
  } catch (error) {
    console.error("[GET /api/admin/orders/fulfillment-queue]", error);
    return NextResponse.json(
      { error: "Failed to load fulfillment queue" },
      { status: 500 },
    );
  }
}
