import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getCustomerLedger } from "@/modules/credit/services/credit-limits.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);

    const { entries, total } = await getCustomerLedger(userId, page, limit);

    return NextResponse.json({
      entries,
      total,
      page,
    });
  } catch (error) {
    console.error("Error fetching customer ledger:", error);
    return NextResponse.json(
      { error: "Failed to fetch customer ledger" },
      { status: 500 },
    );
  }
}
