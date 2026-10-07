import { NextResponse } from "next/server";

import { setDefaultAddress } from "@/modules/address/services/address.service";

/**
 * POST /api/addresses/[id]/set-default
 * Set address as default.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const address = await setDefaultAddress(id);

    return NextResponse.json({
      address,
      message: "Default address updated successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error setting default address:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to set default address" },
      { status: 500 },
    );
  }
}
