import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

/** RBAC tables/RPCs may exist before generated Supabase types are refreshed. */
export async function createRbacSupabaseClient(): Promise<SupabaseClient> {
  return (await createSupabaseServerClient()) as SupabaseClient;
}
