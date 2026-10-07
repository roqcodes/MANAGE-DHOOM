import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpStoreListRow, StoreCreateInput } from "@/common/erp/inventory-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import type { Store } from "@/common/erp/types";

export interface StoreUpdateInput {
  name?: string;
  code?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  description?: string | null;
  storeType?: string | null;
  markupPercent?: number;
  country?: string | null;
  currency?: string | null;
  trn?: string | null;
  taxTemplate?: string | null;
  isActive?: boolean;
  logoUrl?: string | null;
}

export async function listErpStores(search?: string): Promise<ErpStoreListRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("stores")
    .select("id, company_id, name, code, phone, is_active, store_type, country, currency, markup_percent")
    .order("name");
  if (search?.trim()) {
    query = query.or(`name.ilike.%${search.trim()}%,code.ilike.%${search.trim()}%`);
  }
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    company_id: r.company_id,
    name: r.name,
    code: r.code,
    phone: r.phone,
    is_active: r.is_active,
    store_type: r.store_type,
    country: r.country,
    currency: r.currency,
    markup_percent: Number(r.markup_percent ?? 0),
  }));
}

export async function createStore(input: StoreCreateInput): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("is_default", true)
    .maybeSingle();

  if (!company) {
    const { data: anyCompany } = await supabase.from("companies").select("id").limit(1).maybeSingle();
    if (!anyCompany) throw new Error("No company configured");
    return createStoreWithCompany(anyCompany.id, input);
  }

  return createStoreWithCompany(company.id, input);
}

async function createStoreWithCompany(companyId: string, input: StoreCreateInput): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("stores")
    .insert({
      company_id: companyId,
      name: input.name,
      code: input.code ?? null,
      address_line1: input.addressLine1 ?? null,
      address_line2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      pincode: input.pincode ?? null,
      phone: input.phone ?? null,
      description: input.description ?? null,
      store_type: input.storeType ?? "Warehouse",
      markup_percent: input.markupPercent ?? 0,
      country: input.country ?? null,
      currency: input.currency ?? null,
      trn: input.trn ?? null,
      tax_template: input.taxTemplate ?? null,
      is_active: input.isActive ?? true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "store",
    entityId: data.id,
    description: `Store created: ${input.name}`,
  });

  return data.id;
}

export async function getStoreById(id: string): Promise<Store | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("stores").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Store | null;
}

export async function updateStore(id: string, input: StoreUpdateInput): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("stores")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.addressLine1 !== undefined ? { address_line1: input.addressLine1 } : {}),
      ...(input.addressLine2 !== undefined ? { address_line2: input.addressLine2 } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.state !== undefined ? { state: input.state } : {}),
      ...(input.pincode !== undefined ? { pincode: input.pincode } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.storeType !== undefined ? { store_type: input.storeType } : {}),
      ...(input.markupPercent !== undefined ? { markup_percent: input.markupPercent } : {}),
      ...(input.country !== undefined ? { country: input.country } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.trn !== undefined ? { trn: input.trn } : {}),
      ...(input.taxTemplate !== undefined ? { tax_template: input.taxTemplate } : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      ...(input.logoUrl !== undefined ? { logo_url: input.logoUrl } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "store",
    entityId: id,
    description: "Store updated",
  });
}

export async function assignUserStoreAccess(
  userId: string,
  storeId: string,
  isDefault = false,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("user_store_access").upsert({
    user_id: userId,
    store_id: storeId,
    is_default: isDefault,
  });
  if (error) throw new Error(error.message);
}
