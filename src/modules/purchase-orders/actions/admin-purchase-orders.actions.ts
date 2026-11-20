"use server";

import { revalidatePath } from "next/cache";

import { cancelAdminPurchaseOrder, updatePurchaseOrderStatus } from "@/modules/purchase-orders/services/admin-purchase-orders.service";
import type { PoTransitionStatus } from "@/modules/purchase-orders/services/admin-purchase-orders.service";

export async function cancelAdminPurchaseOrderAction(
  poId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await cancelAdminPurchaseOrder(poId);
    revalidatePath("/admin/purchase-orders");
    revalidatePath(`/admin/purchase-orders/${poId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Cancel failed.",
    };
  }
}

export async function updatePoStatusAction(
  poId: string,
  status: PoTransitionStatus,
  expectedDate?: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await updatePurchaseOrderStatus(poId, status, expectedDate);
    revalidatePath("/admin/purchase-orders");
    revalidatePath(`/admin/purchase-orders/${poId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Status update failed.",
    };
  }
}
