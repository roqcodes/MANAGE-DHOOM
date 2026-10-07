import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getAdminNavBadges } from "@/modules/admin/services/nav-badges.service";

/** Sidebar attention counts (orders, transfers, low stock, etc.). Not on the critical path for page loads. */
export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const payload = await getAdminNavBadges();
  return NextResponse.json(payload);
}
