import { NextResponse } from "next/server";

import {
  getAddressById,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/modules/address/services/address.service";

/**
 * GET /api/addresses/[id]
 * Get single address by ID.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const address = await getAddressById(id);

    if (!address) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({ address });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching address:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch address" },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/addresses/[id]
 * Update address.
 * Body: { label?, line1?, line2?, city?, state?, pincode?, phone?, is_default? }
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { label, line1, line2, city, state, pincode, phone, is_default } = body;

    // Validate at least one field is provided
    if (
      !label &&
      !line1 &&
      line2 === undefined &&
      !city &&
      !state &&
      !pincode &&
      !phone &&
      is_default === undefined
    ) {
      return NextResponse.json(
        { error: "At least one field is required" },
        { status: 400 },
      );
    }

    const address = await updateAddress(id, {
      label: label?.trim(),
      line1: line1?.trim(),
      line2: line2?.trim() ?? null,
      city: city?.trim(),
      state: state?.trim(),
      pincode: pincode?.trim(),
      phone: phone?.trim(),
      is_default,
    });

    if (!address) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({
      address,
      message: "Address updated successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error updating address:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update address" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/addresses/[id]
 * Delete address.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = await deleteAddress(id);

    if (!deleted) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

    return NextResponse.json({
      message: "Address deleted successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error deleting address:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete address" },
      { status: 500 },
    );
  }
}

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

    if (!address) {
      return NextResponse.json({ error: "Address not found" }, { status: 404 });
    }

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
