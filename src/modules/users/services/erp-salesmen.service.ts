import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export type ErpSalesmanRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  /** Present only for super-admin directory views. */
  pin?: string | null;
};

export async function listErpSalesmen(options?: {
  includePin?: boolean;
}): Promise<ErpSalesmanRow[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_employees")
    .select("id, full_name, mobile, sales_pin, is_active, created_at")
    .eq("is_salesman", true)
    .order("full_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
    email: null,
    phone: row.mobile && row.mobile !== "—" ? row.mobile : null,
    is_active: row.is_active,
    created_at: row.created_at,
    pin: options?.includePin ? (row.sales_pin ?? null) : undefined,
  }));
}

export async function verifyErpSalesmanPin(
  pin: string,
): Promise<{ id: string; name: string } | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("verify_erp_salesman_pin", { p_pin: pin });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") return null;
  const row = data as { id?: string; name?: string };
  if (!row.id || !row.name) return null;
  return { id: row.id, name: row.name };
}

export async function createErpSalesman(input: {
  name: string;
  pin: string;
  email?: string;
  phone?: string;
}): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("create_erp_salesman", {
    p_name: input.name,
    p_pin: input.pin,
    p_email: input.email ?? undefined,
    p_phone: input.phone ?? undefined,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

async function callUntypedRpc(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  fn: string,
  args: Record<string, unknown>,
) {
  return (
    supabase as unknown as {
      rpc: (
        name: string,
        params: Record<string, unknown>,
      ) => ReturnType<typeof supabase.rpc>;
    }
  ).rpc(fn, args);
}

export async function updateErpSalesman(input: {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  isActive: boolean;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await callUntypedRpc(supabase, "update_erp_salesman", {
    p_id: input.id,
    p_name: input.name,
    p_email: input.email ?? undefined,
    p_phone: input.phone ?? undefined,
    p_is_active: input.isActive,
  });
  if (error) throw new Error(error.message);
}

export async function updateErpSalesmanPin(id: string, pin: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await callUntypedRpc(supabase, "update_erp_salesman_pin", {
    p_id: id,
    p_pin: pin,
  });
  if (error) throw new Error(error.message);
}
