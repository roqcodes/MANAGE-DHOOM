import "server-only";

import {
  requireAdminOnlyProfile,
  requireAdminOrManagerProfile,
} from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { FixedAssetDetail, FixedAssetListRow } from "@/common/erp/finance-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { requireErpStoreId, resolveErpStoreId } from "@/modules/erp/services/store-context.service";
import type { Json } from "@/lib/integrations/supabase/types";

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

type AssetRow = {
  id: string;
  asset_number: string;
  name: string;
  serial_number: string | null;
  brand: string | null;
  purchase_date: string;
  purchase_amount: number;
  warranty_expiry: string | null;
  store_id: string | null;
  vendor_id: string | null;
  stores: { name: string } | null;
  vendors: { name: string } | null;
};

export async function listFixedAssets(
  page = 0,
  limit = 30,
  storeId: string | null = null,
  search: string | null = null,
): Promise<{ data: FixedAssetListRow[]; total: number }> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const from = page * limit;
  const activeStoreId = await resolveErpStoreId(storeId);

  let query = supabase
    .from("erp_fixed_assets")
    .select(
      "id, asset_number, name, serial_number, brand, purchase_date, purchase_amount, warranty_expiry, store_id, vendor_id, stores(name), vendors(name)",
      { count: "exact" },
    )
    .order("purchase_date", { ascending: false });

  if (activeStoreId) query = query.eq("store_id", activeStoreId);

  const q = search?.trim();
  if (q) {
    const pattern = `%${q}%`;
    query = query.or(
      `name.ilike.${pattern},asset_number.ilike.${pattern},brand.ilike.${pattern},serial_number.ilike.${pattern}`,
    );
  }

  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);

  const rows: FixedAssetListRow[] = ((data ?? []) as unknown as AssetRow[]).map((row) => ({
    id: row.id,
    asset_number: row.asset_number,
    name: row.name,
    serial_number: row.serial_number,
    brand: row.brand,
    purchase_date: row.purchase_date,
    purchase_amount: Number(row.purchase_amount),
    warranty_expiry: row.warranty_expiry,
    store_name: row.stores?.name ?? null,
    vendor_name: row.vendors?.name ?? null,
  }));

  return { data: rows, total: count ?? 0 };
}

export async function getFixedAssetDetail(assetId: string): Promise<FixedAssetDetail | null> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_fixed_assets")
    .select("*, stores(name), vendors(name), accounts(name, code)")
    .eq("id", assetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as unknown as FixedAssetDetail;
}

export type FixedAssetInput = {
  name: string;
  purchaseAmount: number;
  storeId?: string;
  purchaseDate?: string;
  paidThroughAccountId?: string | null;
  serialNumber?: string | null;
  brand?: string | null;
  reference?: string | null;
  details?: string | null;
  taxAmount?: number;
  taxMode?: "none" | "exclusive" | "inclusive";
  vendorId?: string | null;
  warrantyExpiry?: string | null;
  warrantyDetails?: string | null;
  maintenanceInfo?: string | null;
};

async function removeFixedAssetJournals(
  supabase: SupabaseServerClient,
  assetId: string,
): Promise<void> {
  const { data: journals, error } = await supabase
    .from("journal_entries")
    .select("id")
    .eq("source_entity_type", "fixed_asset")
    .eq("source_entity_id", assetId);

  if (error) throw new Error(error.message);

  for (const journal of journals ?? []) {
    const journalId = journal.id;
    const { error: linesError } = await supabase
      .from("journal_entry_lines")
      .delete()
      .eq("journal_entry_id", journalId);
    if (linesError) throw new Error(linesError.message);

    const { error: txError } = await supabase
      .from("erp_account_transactions")
      .delete()
      .eq("journal_entry_id", journalId);
    if (txError) throw new Error(txError.message);

    const { error: journalError } = await supabase
      .from("journal_entries")
      .delete()
      .eq("id", journalId);
    if (journalError) throw new Error(journalError.message);
  }
}

async function resolveFixedAssetLedgerAccountId(
  supabase: SupabaseServerClient,
): Promise<string | null> {
  const { data: fixedByCode, error: codeError } = await supabase.rpc("get_account_by_code", {
    p_code: "FIXED_ASSET",
  });
  if (codeError) throw new Error(codeError.message);
  if (fixedByCode) return fixedByCode as string;

  const { data: typeRow, error: typeError } = await supabase
    .from("account_types")
    .select("id")
    .eq("name", "Fixed Asset")
    .limit(1)
    .maybeSingle();
  if (typeError) throw new Error(typeError.message);
  if (!typeRow?.id) return null;

  const { data: accountRow, error: accountError } = await supabase
    .from("accounts")
    .select("id")
    .eq("account_type_id", typeRow.id)
    .limit(1)
    .maybeSingle();
  if (accountError) throw new Error(accountError.message);
  return accountRow?.id ?? null;
}

async function postFixedAssetJournal(
  supabase: SupabaseServerClient,
  assetId: string,
  input: {
    name: string;
    purchaseAmount: number;
    taxAmount?: number;
    purchaseDate?: string;
    storeId: string;
    paidThroughAccountId: string;
  },
): Promise<string | null> {
  const { data: enabled, error: enabledError } = await supabase.rpc("is_posting_enabled", {
    p_event_type: "fixed_asset",
  });
  if (enabledError) throw new Error(enabledError.message);
  if (!enabled) return null;

  const total = input.purchaseAmount + (input.taxAmount ?? 0);
  if (total <= 0) return null;

  const fixedAccountId = await resolveFixedAssetLedgerAccountId(supabase);
  const paidAccountId = input.paidThroughAccountId;
  if (!fixedAccountId || !paidAccountId) return null;

  const lines = [
    {
      account_id: fixedAccountId,
      debit: total,
      description: `Asset ${input.name}`,
    },
    {
      account_id: paidAccountId,
      credit: total,
      description: "Paid through",
    },
  ];

  const { data: journalId, error } = await supabase.rpc("create_posted_journal_entry", {
    p_transaction_date: input.purchaseDate ?? new Date().toISOString().slice(0, 10),
    p_description: `Fixed asset ${input.name}`,
    p_store_id: input.storeId,
    p_source_entity_type: "fixed_asset",
    p_source_entity_id: assetId,
    p_lines: lines as unknown as Json,
  });
  if (error) throw new Error(error.message);
  return journalId as string;
}

export async function createFixedAsset(input: FixedAssetInput): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);

  const { data, error } = await supabase.rpc("create_erp_fixed_asset", {
    p_name: input.name,
    p_purchase_amount: input.purchaseAmount,
    p_store_id: storeId,
    p_purchase_date: input.purchaseDate ?? undefined,
    p_paid_through_account_id: input.paidThroughAccountId ?? undefined,
    p_serial_number: input.serialNumber ?? undefined,
    p_brand: input.brand ?? undefined,
    p_reference: input.reference ?? undefined,
    p_details: input.details ?? undefined,
    p_tax_amount: input.taxAmount ?? 0,
    p_tax_mode: input.taxMode ?? "exclusive",
    p_vendor_id: input.vendorId ?? undefined,
    p_warranty_expiry: input.warrantyExpiry ?? undefined,
    p_warranty_details: input.warrantyDetails ?? undefined,
    p_maintenance_info: input.maintenanceInfo ?? undefined,
  });
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create_fixed_asset",
    entityType: "asset",
    entityId: data as string,
    description: `Fixed asset ${input.name} created`,
    storeId,
  });

  return data as string;
}

export async function updateFixedAsset(
  assetId: string,
  input: FixedAssetInput,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  if (!input.storeId) throw new Error("Store is required");
  if (!input.paidThroughAccountId) throw new Error("Paid-through account is required");

  await removeFixedAssetJournals(supabase, assetId);

  const { error } = await supabase
    .from("erp_fixed_assets")
    .update({
      name: input.name.trim(),
      purchase_amount: input.purchaseAmount,
      store_id: input.storeId,
      purchase_date: input.purchaseDate ?? new Date().toISOString().slice(0, 10),
      paid_through_account_id: input.paidThroughAccountId,
      serial_number: input.serialNumber?.trim() || null,
      brand: input.brand?.trim() || null,
      reference: input.reference?.trim() || null,
      details: input.details?.trim() || null,
      tax_amount: input.taxAmount ?? 0,
      tax_mode: input.taxMode ?? "exclusive",
      vendor_id: input.vendorId ?? null,
      warranty_expiry: input.warrantyExpiry || null,
      warranty_details: input.warrantyDetails?.trim() || null,
      maintenance_info: input.maintenanceInfo ?? null,
      journal_entry_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assetId);
  if (error) throw new Error(error.message);

  const journalId = await postFixedAssetJournal(supabase, assetId, {
    name: input.name.trim(),
    purchaseAmount: input.purchaseAmount,
    taxAmount: input.taxAmount,
    purchaseDate: input.purchaseDate,
    storeId: input.storeId,
    paidThroughAccountId: input.paidThroughAccountId,
  });

  if (journalId) {
    const { error: linkError } = await supabase
      .from("erp_fixed_assets")
      .update({ journal_entry_id: journalId })
      .eq("id", assetId);
    if (linkError) throw new Error(linkError.message);
  }

  await logAuditEvent({
    action: "update",
    entityType: "asset",
    entityId: assetId,
    description: `Fixed asset ${input.name} updated`,
    storeId: input.storeId ?? undefined,
  });
}

export async function deleteFixedAsset(assetId: string): Promise<void> {
  await requireAdminOnlyProfile();
  const supabase = await createSupabaseServerClient();

  const { data: asset, error: assetError } = await supabase
    .from("erp_fixed_assets")
    .select("name, store_id")
    .eq("id", assetId)
    .maybeSingle();
  if (assetError) throw new Error(assetError.message);
  if (!asset) throw new Error("Fixed asset not found");

  await removeFixedAssetJournals(supabase, assetId);

  const { error } = await supabase.from("erp_fixed_assets").delete().eq("id", assetId);
  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "delete",
    entityType: "asset",
    entityId: assetId,
    description: `Fixed asset ${asset.name} deleted`,
    storeId: asset.store_id ?? undefined,
  });
}
