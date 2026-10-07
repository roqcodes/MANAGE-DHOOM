"use server";

import { revalidatePath } from "next/cache";

import { setStoreUserVerified } from "@/modules/users/services/users.service";

function revalidateUserPaths(userId?: string) {
  revalidatePath("/admin/customers");
  revalidatePath("/admin/users");
  if (userId) revalidatePath(`/admin/customers/${userId}`);
}

export async function blockUserAction(userId: string): Promise<void> {
  await setStoreUserVerified(userId, false);
  revalidateUserPaths(userId);
}

export async function unblockUserAction(userId: string): Promise<void> {
  await setStoreUserVerified(userId, true);
  revalidateUserPaths(userId);
}

export async function bulkBlockUsersAction(ids: string[]): Promise<void> {
  for (const id of ids) {
    await setStoreUserVerified(id, false);
  }
  revalidateUserPaths();
}

export async function bulkUnblockUsersAction(ids: string[]): Promise<void> {
  for (const id of ids) {
    await setStoreUserVerified(id, true);
  }
  revalidateUserPaths();
}
