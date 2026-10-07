"use server";

import { revalidatePath } from "next/cache";

import { recordAuthAudit } from "@/modules/auth/services/auth-audit.service";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import {
  rejectUserById,
  updateUserRoleById,
  verifyUserById,
} from "@/modules/users/services/portal-user-admin.service";

export async function verifyUserAction(userId: string): Promise<void> {
  const { profile } = await getCurrentSessionProfile();
  if (!profile?.id) throw new Error("Unauthorized.");

  try {
    await verifyUserById(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordAuthAudit({
      action: "sign_in",
      userId: profile.id,
      outcome: "failure",
      reason: `verify user ${userId}: ${msg}`,
    });
    throw e instanceof Error ? e : new Error(msg);
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/vendors");
}

export async function rejectUserAction(userId: string): Promise<void> {
  const { profile } = await getCurrentSessionProfile();
  if (!profile?.id) throw new Error("Unauthorized.");

  try {
    await rejectUserById(userId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await recordAuthAudit({
      action: "sign_in",
      userId: profile.id,
      outcome: "failure",
      reason: `reject user ${userId}: ${msg}`,
    });
    throw e instanceof Error ? e : new Error(msg);
  }

  revalidatePath("/admin/users");
}

export async function updateUserRoleAction(
  userId: string,
  newRole: string,
): Promise<void> {
  await updateUserRoleById(userId, newRole);
  revalidatePath("/admin/users");
  revalidatePath("/admin/vendors");
}
