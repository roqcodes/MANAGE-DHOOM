"use server";

import { revalidatePath } from "next/cache";

import type { OrderStatus } from "@/common/admin/types";
import { cancelOrderAndRefund } from "@/modules/orders/services/cancel-order.service";
import {
  updateOrderDetailsById,
  updateOrderStatusById,
  updateOrdersStatusByIds,
} from "@/modules/orders/services/orders.service";
import { updateOrderWithItems } from "@/modules/orders/services/update-order.service";

const VALID_STATUSES: OrderStatus[] = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

const VALID_PAYMENT_STATUSES = ["pending", "paid", "refunded", "not_required"] as const;

export async function updateOrderStatusAction(
  orderId: string,
  status: string,
): Promise<void> {
  if (!VALID_STATUSES.includes(status as OrderStatus)) {
    throw new Error("Invalid status value.");
  }

  await updateOrderStatusById(orderId, status);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/erp/sales-orders");
  revalidatePath(`/admin/erp/sales-orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function updateOrderDetailsAction(
  orderId: string,
  input: {
    status?: string;
    paymentStatus?: string;
    merchantNote?: string | null;
    shipmentDate?: string | null;
  },
): Promise<void> {
  if (input.status && !VALID_STATUSES.includes(input.status as OrderStatus)) {
    throw new Error("Invalid status value.");
  }
  if (
    input.paymentStatus &&
    !VALID_PAYMENT_STATUSES.includes(
      input.paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number],
    )
  ) {
    throw new Error("Invalid payment status.");
  }

  await updateOrderDetailsById(orderId, input);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/erp/sales-orders");
  revalidatePath(`/admin/erp/sales-orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function cancelOrderAndRefundAction(
  orderId: string,
): Promise<void> {
  await cancelOrderAndRefund(orderId);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/erp/sales-orders");
  revalidatePath(`/admin/erp/sales-orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}

export async function bulkUpdateOrderStatusAction(
  orderIds: string[],
  status: string,
): Promise<void> {
  if (orderIds.length === 0) return;

  if (!VALID_STATUSES.includes(status as OrderStatus)) {
    throw new Error("Invalid status value.");
  }

  await updateOrdersStatusByIds(orderIds, status);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/erp/sales-orders");
  for (const orderId of orderIds) {
    revalidatePath(`/admin/orders/${orderId}`);
  }
}

export async function updateOrderWithItemsAction(
  orderId: string,
  input: {
    items: {
      variantId: string;
      quantity: number;
      listPrice: number;
      unitPrice: number;
    }[];
    orderDiscount?: number;
    status?: string;
    paymentStatus?: string;
    merchantNote?: string | null;
  },
): Promise<void> {
  if (input.status && !VALID_STATUSES.includes(input.status as OrderStatus)) {
    throw new Error("Invalid status value.");
  }
  if (
    input.paymentStatus &&
    !VALID_PAYMENT_STATUSES.includes(
      input.paymentStatus as (typeof VALID_PAYMENT_STATUSES)[number],
    )
  ) {
    throw new Error("Invalid payment status.");
  }

  await updateOrderWithItems(orderId, input);
  revalidatePath("/admin/orders");
  revalidatePath("/admin/erp/sales-orders");
  revalidatePath(`/admin/erp/sales-orders/${orderId}`);
  revalidatePath(`/admin/orders/${orderId}`);
}
