import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { fetchVerifiedDeliveryUsers } from "@/modules/users/services/users.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const supabase = await createSupabaseServerClient();
  const riders = await fetchVerifiedDeliveryUsers(supabase);

  return NextResponse.json({ riders });
}
