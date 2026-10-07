import { NextResponse } from "next/server";

/**
 * @deprecated Use ERP stock adjustments (/api/admin/erp/stock-adjustments).
 */
export async function POST() {
  return NextResponse.json(
    {
      error:
        "This endpoint is deprecated. Use ERP stock adjustments to record damaged stock.",
    },
    { status: 410 },
  );
}
