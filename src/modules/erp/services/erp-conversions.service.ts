import "server-only";

import { convertOrderToInvoice } from "@/modules/erp/services/convert-order-to-invoice.service";

export async function convertSalesOrderToInvoice(orderId: string): Promise<string> {
  return convertOrderToInvoice(orderId);
}
