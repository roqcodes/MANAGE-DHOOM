"use server";

import { revalidatePath } from "next/cache";

import {
  assignOrderFulfillmentStore,
  shipOrderFulfillments,
  shipSingleOrderFulfillment,
} from "@/modules/orders/services/order-fulfillment.service";

export async function assignOrderFulfillmentStoreAction(
  orderId: string,
  storeId: string,
): Promise<void> {
  if (!storeId) throw new Error("Store is required.");
  await assignOrderFulfillmentStore(orderId, storeId);
  revalidatePaths(orderId);
}

export async function shipOrderFulfillmentAction(
  orderId: string,
  fulfillmentId: string,
): Promise<void> {
  await shipSingleOrderFulfillment(fulfillmentId);
  revalidatePaths(orderId);
}

export async function shipAllOrderFulfillmentsAction(
  orderId: string,
): Promise<void> {
  await shipOrderFulfillments(orderId);
  revalidatePaths(orderId);
}

function revalidatePaths(orderId: string) {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/erp/fulfillment-queue");
  revalidatePath(`/admin/orders/${orderId}`);
}
