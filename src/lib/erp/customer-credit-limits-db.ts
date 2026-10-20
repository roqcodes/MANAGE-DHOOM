import "server-only";

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

/** Staff mutations bypass missing table grants until migrations are applied everywhere. */
export async function staffCustomerCreditLimitsClient() {
  const admin = createSupabaseAdminClient();
  if (admin) return admin;
  return createSupabaseServerClient();
}
