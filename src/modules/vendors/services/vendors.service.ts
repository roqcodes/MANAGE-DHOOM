import "server-only";

import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  Paginated,
  Vendor,
  VendorCatalogStats,
  VendorProductWithVariant,
  VariantWithProduct,
} from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";
import type { VendorErpListRow } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import {
  listActiveVendorsForPicker,
  searchActiveVendorsQuery,
  VENDOR_PICKER_SEARCH_LIMIT,
} from "@/lib/erp/server/vendor-catalog-search";

export async function getVendors(
  page = 0,
  options?: { search?: string; vendorType?: string; limit?: number },
): Promise<Paginated<Vendor>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const limit = options?.limit ?? PAGE_SIZE;
  const from = page * limit;

  let dataQuery = supabase
    .from("vendors")
    .select("id,name,contact,is_active,created_at")
    .order("created_at", { ascending: false })
    .range(from, from + limit - 1);

  let countQuery = supabase.from("vendors").select("id", { count: "exact", head: true });

  if (options?.search?.trim()) {
    const s = options.search.trim();
    const filter = `name.ilike.%${s}%,contact.ilike.%${s}%,email.ilike.%${s}%,trn.ilike.%${s}%`;
    dataQuery = dataQuery.or(filter);
    countQuery = countQuery.or(filter);
  }

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery]);

  return {
    data: (dataResult.data ?? []) as Vendor[],
    total: countResult.count ?? 0,
  };
}

export async function getVendorsErp(
  page = 0,
  options?: { search?: string; vendorType?: string; limit?: number },
): Promise<Paginated<VendorErpListRow>> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const limit = options?.limit ?? PAGE_SIZE;
  const from = page * limit;

  let dataQuery = supabase
    .from("vendors")
    .select(
      "id, name, address, trn, phone, fax, po_box, email, vendor_type, is_active",
    )
    .order("name", { ascending: true })
    .range(from, from + limit - 1);

  let countQuery = supabase.from("vendors").select("id", { count: "exact", head: true });

  if (options?.vendorType && options.vendorType !== "all") {
    dataQuery = dataQuery.eq("vendor_type", options.vendorType);
    countQuery = countQuery.eq("vendor_type", options.vendorType);
  }
  if (options?.search?.trim()) {
    const s = options.search.trim();
    const filter = `name.ilike.%${s}%,address.ilike.%${s}%,email.ilike.%${s}%,trn.ilike.%${s}%,phone.ilike.%${s}%`;
    dataQuery = dataQuery.or(filter);
    countQuery = countQuery.or(filter);
  }

  const [dataResult, countResult] = await Promise.all([dataQuery, countQuery]);
  if (dataResult.error) throw new Error(dataResult.error.message);

  return {
    data: (dataResult.data ?? []) as VendorErpListRow[],
    total: countResult.count ?? 0,
  };
}

export async function searchActiveVendors(
  query: string,
  limit = VENDOR_PICKER_SEARCH_LIMIT,
): Promise<Pick<Vendor, "id" | "name">[]> {
  return searchActiveVendorsQuery(query, limit);
}

export async function getVendorCatalogStats(): Promise<VendorCatalogStats> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const [totalRes, activeRes, linesRes] = await Promise.all([
    supabase.from("vendors").select("id", { count: "exact", head: true }),
    supabase
      .from("vendors")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
    supabase.from("vendor_products").select("id", { count: "exact", head: true }),
  ]);

  const total = totalRes.count ?? 0;
  const active = activeRes.count ?? 0;
  return {
    total,
    active,
    inactive: Math.max(0, total - active),
    supplyLines: linesRes.count ?? 0,
  };
}

/** Lightweight list for admin PO filter dropdowns */
export async function listVendorsForPurchaseOrderFilter(): Promise<
  Pick<Vendor, "id" | "name">[]
> {
  return listActiveVendorsForPicker(VENDOR_PICKER_SEARCH_LIMIT);
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vendors")
    .select("id,name,contact,is_active,created_at")
    .eq("id", id)
    .maybeSingle();
  return data as Vendor | null;
}

export async function getVendorProducts(
  vendorId: string,
): Promise<VendorProductWithVariant[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("vendor_products")
    .select(
      "id,vendor_id,variant_id,base_price,stock,created_at,product_variants(id,name,products(id,name))",
    )
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as VendorProductWithVariant[];
}

export async function getAvailableVariants(
  vendorId: string,
): Promise<VariantWithProduct[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const [allVariants, assigned] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id,product_id,name,price,mrp,created_at,products(id,name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("vendor_products")
      .select("variant_id")
      .eq("vendor_id", vendorId),
  ]);

  const assignedIds = new Set(
    (assigned.data ?? []).map((r) => r.variant_id).filter(Boolean),
  );

  return (
    (allVariants.data ?? []) as unknown as VariantWithProduct[]
  ).filter((v) => !assignedIds.has(v.id));
}

export async function countVendorProductsForVendor(
  vendorId: string,
): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("vendor_products")
    .select("id", { count: "exact", head: true })
    .eq("vendor_id", vendorId);
  return count ?? 0;
}

export async function insertVendor(input: {
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
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  if (
    input.openingBalance !== undefined &&
    input.openingBalance !== 0 &&
    !input.openingBalanceDate
  ) {
    throw new Error("Opening balance date is required when opening balance is set");
  }

  const { data, error } = await supabase
    .from("vendors")
    .insert({
      name: input.name,
      contact: input.contact ?? null,
      vendor_type: input.vendorType ?? null,
      trn: input.trn ?? null,
      phone: input.phone ?? null,
      fax: input.fax ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      po_box: input.poBox ?? null,
      notes: input.notes ?? null,
      opening_balance: input.openingBalance ?? 0,
      opening_balance_date: input.openingBalanceDate ?? null,
      is_active: input.isActive ?? true,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "vendor",
    entityId: data.id,
    description: `Vendor created: ${input.name}`,
  });

  return data.id;
}

export async function updateVendorById(
  id: string,
  input: { name: string; contact: string },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vendors")
    .update({ name: input.name, contact: input.contact })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setVendorActive(
  id: string,
  isActive: boolean,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vendors")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setVendorsActiveByIds(
  ids: string[],
  isActive: boolean,
): Promise<void> {
  if (ids.length === 0) return;

  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vendors")
    .update({ is_active: isActive })
    .in("id", ids);
  if (error) throw new Error(error.message);
}

export async function deleteVendorIfNoProducts(vendorId: string): Promise<void> {
  await requireAdminOnlyProfile();
  const n = await countVendorProductsForVendor(vendorId);
  if (n > 0) {
    throw new Error("Cannot delete vendor while vendor_products exist.");
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("vendors").delete().eq("id", vendorId);
  if (error) throw new Error(error.message);
}

export async function insertVendorProduct(input: {
  vendorId: string;
  variantId: string;
  basePrice: number;
  stock: number;
}): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("vendor_products").insert({
    vendor_id: input.vendorId,
    variant_id: input.variantId,
    base_price: input.basePrice,
    stock: input.stock,
  });
  if (error) throw new Error(error.message);
}

export async function updateVendorProductById(
  id: string,
  input: { basePrice: number; stock: number },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("vendor_products")
    .update({ base_price: input.basePrice, stock: input.stock })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteVendorProductById(id: string): Promise<void> {
  await requireAdminOnlyProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("vendor_products").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
