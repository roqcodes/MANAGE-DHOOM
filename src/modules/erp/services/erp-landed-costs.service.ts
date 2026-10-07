import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { ErpLandedCostItem } from "@/common/erp/purchasing-types";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";

export async function listLandedCostItems(): Promise<ErpLandedCostItem[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_landed_cost_items")
    .select("id, name, description, rate, tax_rate_percent, is_active")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    rate: Number(row.rate ?? 0),
    tax_rate_percent: Number(row.tax_rate_percent ?? 0),
    is_active: row.is_active,
  }));
}

export async function createLandedCostItem(input: {
  name: string;
  description?: string | null;
  rate: number;
  taxRatePercent: number;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("erp_landed_cost_items")
    .insert({
      name: input.name,
      description: input.description ?? null,
      rate: input.rate,
      tax_rate_percent: input.taxRatePercent,
      is_active: true,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "create",
    entityType: "landed_cost_item",
    entityId: data.id,
    description: `Landed cost item: ${input.name}`,
  });

  return data.id;
}

export async function updateLandedCostItem(
  id: string,
  input: {
    name?: string;
    description?: string | null;
    rate?: number;
    taxRatePercent?: number;
    isActive?: boolean;
  },
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("erp_landed_cost_items")
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.rate !== undefined ? { rate: input.rate } : {}),
      ...(input.taxRatePercent !== undefined
        ? { tax_rate_percent: input.taxRatePercent }
        : {}),
      ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  await logAuditEvent({
    action: "update",
    entityType: "landed_cost_item",
    entityId: id,
    description: "Landed cost item updated",
  });
}
