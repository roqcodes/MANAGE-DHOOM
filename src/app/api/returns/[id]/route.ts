import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getReturnById,
  updateReturnStatus,
} from "@/modules/returns/services/returns.service";
import type { ReturnStatus } from "@/modules/returns/services/returns.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const returnRow = await getReturnById(id);

    if (!returnRow) {
      return NextResponse.json(
        { error: "Return not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ data: returnRow });
  } catch (error) {
    console.error("Error fetching return:", error);
    return NextResponse.json(
      { error: "Failed to fetch return" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();

    if (!body.status) {
      return NextResponse.json(
        { error: "status is required" },
        { status: 400 },
      );
    }

    const validStatuses: ReturnStatus[] = [
      "pending",
      "approved",
      "rejected",
      "refunded",
    ];

    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status. Must be: pending, approved, rejected, or refunded" },
        { status: 400 },
      );
    }

    const updated = await updateReturnStatus(
      id,
      body.status,
      body.notes,
    );

    return NextResponse.json({
      ok: true,
      data: updated,
      message: `Return ${body.status} successfully`,
    });
  } catch (error) {
    console.error("Error updating return:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to update return" },
      { status: 500 },
    );
  }
}
