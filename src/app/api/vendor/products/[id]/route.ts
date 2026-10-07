import { NextResponse } from "next/server";

import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import { updateMyVendorProduct } from "@/modules/vendor/services/vendor-products.service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  try {
    const body = await request.json();

    if (body.basePrice !== undefined) {
      if (typeof body.basePrice !== "number" || body.basePrice <= 0) {
        return NextResponse.json(
          { error: "basePrice must be a positive number" },
          { status: 400 },
        );
      }
    }

    if (body.stock !== undefined) {
      if (
        typeof body.stock !== "number" ||
        body.stock < 0 ||
        !Number.isInteger(body.stock)
      ) {
        return NextResponse.json(
          { error: "stock must be a non-negative integer" },
          { status: 400 },
        );
      }
    }

    if (body.basePrice === undefined && body.stock === undefined) {
      return NextResponse.json(
        { error: "At least one of basePrice or stock is required" },
        { status: 400 },
      );
    }

    await updateMyVendorProduct(id, {
      basePrice: body.basePrice,
      stock: body.stock,
    });

    return NextResponse.json({
      ok: true,
      message: "Product updated successfully",
    });
  } catch (error) {
    console.error("Error updating vendor product:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to update product" },
      { status: 500 },
    );
  }
}
