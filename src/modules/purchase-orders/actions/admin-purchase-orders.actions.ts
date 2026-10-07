"use server";

import { revalidatePath } from "next/cache";

import { cancelAdminPurchaseOrder } from "@/modules/purchase-orders/services/admin-purchase-orders.service";

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
