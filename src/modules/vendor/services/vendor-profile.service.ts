import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireVendorProfile } from "@/modules/admin/services/rbac.service";
import type { UserProfile } from "@/common/auth/types";
import type { VendorProfileRecord } from "@/modules/vendor/types";

export async function getMyVendorProfilePage(): Promise<{
  user: UserProfile;
  vendor: VendorProfileRecord | null;
}> {
  const user = await requireVendorProfile();
  const supabase = await createSupabaseServerClient();

  const { data: vendor, error } = await supabase
    .from("vendors")
    .select("id,name,contact,is_active,created_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    user,
    vendor: vendor as VendorProfileRecord | null,
  };
}
