import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export type ErpSalesmanRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
};

export async function listErpSalesmen(): Promise<ErpSalesmanRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_salesmen")
    .select("id, name, email, phone, is_active, created_at")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as ErpSalesmanRow[];
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
