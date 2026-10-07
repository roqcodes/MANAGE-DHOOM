import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { PurchaseReceiveAdjustments } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";

export async function finalizePurchaseReceive(
  receiveId: string,
  reconcileBill = true,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("finalize_erp_purchase_receive", {
    p_receive_id: receiveId,
    p_reconcile_bill: reconcileBill,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "finalize_purchase_receive",
    entityType: "purchase_receive",
    entityId: receiveId,
    description: "Purchase receive finalized",
  });
}

export async function cancelPurchaseReceive(receiveId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.rpc("cancel_erp_purchase_receive", {
    p_receive_id: receiveId,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "cancel_purchase_receive",
    entityType: "purchase_receive",
    entityId: receiveId,
    description: "Purchase receive cancelled",
  });
}

export async function getPurchaseReceiveDetail(receiveId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_purchase_receives")
    .select(
      "*, vendors(name, phone, address), stores(name), purchase_orders(po_number, status, expected_delivery_date), erp_purchase_bills(purchase_bill_number, status, expected_delivery_date), erp_purchase_receive_lines(*)",
    )
    .eq("id", receiveId)
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function getPurchaseReceiveAdjustments(
  receiveId: string,
): Promise<PurchaseReceiveAdjustments> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("get_purchase_receive_adjustments", {
    p_receive_id: receiveId,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PurchaseReceiveAdjustments;
}

export async function reversePurchaseReceive(
  receiveId: string,
  reason?: string | null,
): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc("reverse_erp_purchase_receive", {
    p_receive_id: receiveId,
    p_reason: reason ?? undefined,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "reverse_purchase_receive",
    entityType: "purchase_receive",
    entityId: receiveId,
    description: reason ?? "Purchase receive reversed",
  });

  return data as string;
}
