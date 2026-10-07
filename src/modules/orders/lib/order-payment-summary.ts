import type { OrderWithItems } from "@/common/admin/types";
import { orderItemLineTotal } from "@/modules/orders/lib/order-display-blocks";

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type OrderPaymentSummary = {
  itemTotal: number;
  catalogSubtotal: number | null;
  lineDiscount: number;
  orderDiscount: number;
  totalDiscount: number;
  tax: number;
  grandTotal: number;
};

export function computeOrderPaymentSummary(order: OrderWithItems): OrderPaymentSummary {
  const itemTotal = roundMoney(
    order.order_items.reduce((sum, item) => sum + orderItemLineTotal(item), 0),
  );

  const storedSubtotal =
    order.subtotal != null && Number.isFinite(Number(order.subtotal))
      ? roundMoney(Number(order.subtotal))
      : null;
  const storedDiscount =
    order.discount != null && Number.isFinite(Number(order.discount))
      ? roundMoney(Math.max(0, Number(order.discount)))
      : 0;
  const storedTax =
    order.tax != null && Number.isFinite(Number(order.tax))
      ? roundMoney(Math.max(0, Number(order.tax)))
      : 0;

  const grandTotal = roundMoney(Number(order.total_amount ?? itemTotal));

  if (storedSubtotal != null) {
    const lineDiscount = roundMoney(Math.max(0, storedSubtotal - itemTotal));
    const orderDiscount = roundMoney(Math.max(0, storedDiscount - lineDiscount));

    return {
      itemTotal,
      catalogSubtotal: storedSubtotal,
      lineDiscount,
      orderDiscount,
      totalDiscount: storedDiscount,
      tax: storedTax,
      grandTotal,
    };
  }

  return {
    itemTotal,
    catalogSubtotal: null,
    lineDiscount: 0,
    orderDiscount: 0,
    totalDiscount: 0,
    tax: storedTax,
    grandTotal,
  };
}
