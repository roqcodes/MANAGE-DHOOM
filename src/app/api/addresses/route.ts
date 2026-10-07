import { NextResponse } from "next/server";

import { getAddresses, createAddress } from "@/modules/address/services/address.service";

/**
 * GET /api/addresses
 * Get all addresses for current user.
 */
export async function GET() {
  try {
    const addresses = await getAddresses();

    return NextResponse.json({
      addresses,
      count: addresses.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching addresses:", error);
    return NextResponse.json(
      { error: "Failed to fetch addresses" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/addresses
 * Create new address.
 * Body: { label, line1, line2?, city, state, pincode, phone, is_default? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    const { label, line1, line2, city, state, pincode, phone, is_default } = body;

    // Validate required fields
    if (!label || typeof label !== "string" || !label.trim()) {
      return NextResponse.json(
        { error: "Label is required" },
        { status: 400 },
      );
    }

    if (!line1 || typeof line1 !== "string" || !line1.trim()) {
      return NextResponse.json(
        { error: "Line 1 is required" },
        { status: 400 },
      );
    }

    if (!city || typeof city !== "string" || !city.trim()) {
      return NextResponse.json(
        { error: "City is required" },
        { status: 400 },
      );
    }

    if (!state || typeof state !== "string" || !state.trim()) {
      return NextResponse.json(
        { error: "State is required" },
        { status: 400 },
      );
    }

    if (!pincode || typeof pincode !== "string" || !pincode.trim()) {
      return NextResponse.json(
        { error: "Pincode is required" },
        { status: 400 },
      );
    }

    if (!phone || typeof phone !== "string" || !phone.trim()) {
      return NextResponse.json(
        { error: "Phone is required" },
        { status: 400 },
      );
    }

    const address = await createAddress({
      label: label.trim(),
      line1: line1.trim(),
      line2: line2?.trim() || null,
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
      phone: phone.trim(),
      is_default: is_default ?? false,
    });

    return NextResponse.json({
      address,
      message: "Address created successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error creating address:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create address" },
      { status: 500 },
    );
  }
}
