"use server";

import { revalidatePath } from "next/cache";

import {
  deleteVendorIfNoProducts,
  insertVendor,
  setVendorActive,
  setVendorsActiveByIds,
  updateVendorById,
} from "@/modules/vendors/services/vendors.service";

export async function createVendorAction(data: {
  name: string;
  contact?: string;
  vendorType?: string;
  trn?: string;
  phone?: string;
  fax?: string;
  email?: string;
  address?: string;
  poBox?: string;
  notes?: string;
  openingBalance?: number;
  openingBalanceDate?: string | null;
  isActive?: boolean;
}): Promise<string> {
  const id = await insertVendor(data);
  revalidatePath("/admin/vendors");
  return id;
}

export async function updateVendorAction(
  id: string,
  data: { name: string; contact: string },
): Promise<void> {
  await updateVendorById(id, { name: data.name, contact: data.contact });
  revalidatePath("/admin/vendors");
}

export async function toggleVendorAction(
  id: string,
  isActive: boolean,
): Promise<void> {
  await setVendorActive(id, isActive);
  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${id}`);
}

export async function deleteVendorAction(id: string): Promise<void> {
  await deleteVendorIfNoProducts(id);
  revalidatePath("/admin/vendors");
}

export async function bulkSetVendorsActiveAction(
  ids: string[],
  isActive: boolean,
): Promise<void> {
  if (ids.length === 0) return;
  await setVendorsActiveByIds(ids, isActive);
  revalidatePath("/admin/vendors");
  for (const id of ids) {
    revalidatePath(`/admin/vendors/${id}`);
  }
}

export async function bulkDeleteVendorsAction(ids: string[]): Promise<void> {
  for (const id of ids) {
    await deleteVendorIfNoProducts(id);
  }
  revalidatePath("/admin/vendors");
}
