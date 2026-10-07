import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { buildAdminSearchIndex } from "@/modules/admin/services/admin-search-index.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const index = await buildAdminSearchIndex();
  return NextResponse.json(index, {
    headers: {
      "Cache-Control": "private, max-age=60",
    },
  });
}
