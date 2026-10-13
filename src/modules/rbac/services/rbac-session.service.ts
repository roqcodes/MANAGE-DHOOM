import "server-only";

import { parseRbacSession, type RbacSession } from "@/modules/rbac/lib/permission-catalog";
import { createRbacSupabaseClient } from "@/modules/rbac/lib/rbac-supabase";

export async function loadRbacSessionForUser(
  userId: string,
): Promise<RbacSession | null> {
  const supabase = await createRbacSupabaseClient();
  const { data, error } = await supabase.rpc("get_my_rbac_session", {
    p_user_id: userId,
  });

  if (error) {
    throw new Error(error.message);
  }

  return parseRbacSession(data);
}
