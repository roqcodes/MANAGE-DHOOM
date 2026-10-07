import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { listAuditLogsForEntity } from "@/modules/erp/services/audit-log.service";
import type { AuditLogEntry } from "@/common/erp/types";

export type SalesOrderDetail = {
  id: string;
  user_id: string;
  store_id: string;
  sales_order_number: string | null;
  reference_number: string | null;
  status: string;
  payment_status: string;
  subtotal: number;
  tax: number;
  discount: number;
  total_amount: number;
  tax_inclusive: boolean;
  shipment_date: string | null;
  delivery_method: string | null;
  merchant_note: string | null;
  created_at: string;
  inventory_committed: boolean;
  invoice_id: string | null;
  users: {
    id: string;
    name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
  } | null;
  stores: { id: string; name: string } | null;
  order_items: Array<{
    id: string;
    product_id: string | null;
    product_name: string | null;
    quantity: number;
    final_price: number;
    price: number;
    tax_rate_percent: number;
  }>;
};

export async function getSalesOrderDetail(
  orderId: string,
): Promise<{ order: SalesOrderDetail; auditLogs: AuditLogEntry[] } | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, store_id, sales_order_number, reference_number, status, payment_status, subtotal, tax, discount, total_amount, shipment_date, delivery_method, merchant_note, created_at, inventory_committed, invoice_id, source, users:users!orders_user_fkey(id, name, email, phone, company_name), stores(id, name), order_items(id, product_id, product_name, quantity, final_price, price, tax_rate_percent)",
    )
    .eq("id", orderId)
    .eq("source", "sales_order")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    user_id: string;
    store_id: string;
    sales_order_number: string | null;
    reference_number: string | null;
    status: string;
    payment_status: string;
    subtotal: number | null;
    tax: number | null;
    discount: number | null;
    total_amount: number | null;
    shipment_date: string | null;
    delivery_method: string | null;
    merchant_note: string | null;
    created_at: string;
    inventory_committed: boolean;
    invoice_id: string | null;
    users: SalesOrderDetail["users"];
    stores: SalesOrderDetail["stores"];
    order_items: Array<{
      id: string;
      product_id: string | null;
      product_name: string | null;
      quantity: number;
      final_price: number | null;
      price: number | null;
      tax_rate_percent: number | null;
    }>;
  };
  const auditLogs = await listAuditLogsForEntity("sales_order", orderId);

  return {
    order: {
      id: row.id,
      user_id: row.user_id as string,
      store_id: row.store_id as string,
      sales_order_number: row.sales_order_number,
      reference_number: row.reference_number,
      status: row.status,
      payment_status: row.payment_status,
      subtotal: Number(row.subtotal ?? 0),
      tax: Number(row.tax ?? 0),
      discount: Number(row.discount ?? 0),
      total_amount: Number(row.total_amount ?? 0),
      tax_inclusive: true,
      shipment_date: row.shipment_date,
      delivery_method: row.delivery_method,
      merchant_note: row.merchant_note,
      created_at: row.created_at,
      inventory_committed: Boolean(row.inventory_committed),
      invoice_id: row.invoice_id ?? null,
      users: row.users as SalesOrderDetail["users"],
      stores: row.stores as SalesOrderDetail["stores"],
      order_items: (row.order_items ?? []).map((item) => ({
        id: item.id,
        product_id: item.product_id ?? null,
        product_name: item.product_name,
        quantity: Number(item.quantity ?? 0),
        final_price: Number(item.final_price ?? item.price ?? 0),
        price: Number(item.price ?? 0),
        tax_rate_percent: Number(item.tax_rate_percent ?? 0),
      })),
    },
    auditLogs,
  };
}
