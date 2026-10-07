"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  acceptMyPurchaseOrder,
  markMyPurchaseOrderDelivered,
} from "@/modules/vendor/services/vendor-purchase-orders.service";

const poIdSchema = z.string().uuid("Invalid purchase order.");

export async function acceptVendorPurchaseOrderAction(
  poId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = poIdSchema.safeParse(poId);
  if (!id.success) {
    return { ok: false, message: id.error.flatten().formErrors[0] ?? "Invalid id." };
  }

  try {
    await acceptMyPurchaseOrder(id.data);
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Could not accept purchase order.",
    };
  }

  revalidatePath("/vendor/purchase-orders");
  revalidatePath(`/vendor/purchase-orders/${id.data}`);
  return { ok: true };
}

export async function markVendorPurchaseOrderDeliveredAction(
  poId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = poIdSchema.safeParse(poId);
  if (!id.success) {
    return { ok: false, message: id.error.flatten().formErrors[0] ?? "Invalid id." };
  }

  try {
    await markMyPurchaseOrderDelivered(id.data);
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error ? e.message : "Could not mark purchase order delivered.",
    };
  }

  revalidatePath("/vendor/purchase-orders");
  revalidatePath(`/vendor/purchase-orders/${id.data}`);
  return { ok: true };
}
