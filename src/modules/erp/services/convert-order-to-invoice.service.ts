import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";

export async function convertOrderToInvoice(orderId: string): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("convert_order_to_erp_invoice" as never, {
    p_order_id: orderId,
  } as never);

  if (error) throw new Error(error.message);

  const invoiceId = data as string;

  const { data: order } = await supabase
    .from("orders")
    .select("source, store_id")
    .eq("id", orderId)
    .maybeSingle();

  await logAuditEvent({
    action: "convert_to_invoice",
    entityType: order?.source === "sales_order" ? "sales_order" : "order",
    entityId: orderId,
    description: "Order converted to invoice",
    storeId: order?.store_id ?? undefined,
  });

  return invoiceId;
}
