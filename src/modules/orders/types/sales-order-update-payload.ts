import type { SalesOrderCreatePayload } from "@/modules/orders/types/sales-order-create-payload";

/** Frozen outbox payload for sales_order.update. */
export type SalesOrderUpdatePayload = SalesOrderCreatePayload & {
  orderId: string;
};

export function salesOrderResourceScope(orderId: string): string {
  return `sales_order:${orderId}`;
}
