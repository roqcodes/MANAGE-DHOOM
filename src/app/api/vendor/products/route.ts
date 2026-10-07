import { NextResponse } from "next/server";

import type { VendorPoStatusFilter } from "@/modules/vendor/types";
import { VENDOR_PO_STATUS_FILTERS } from "@/modules/vendor/types";
import { requireVendorApiProfile } from "@/lib/api/vendor-api-auth";
import {
  listMyVendorProducts,
  listAvailableCatalogVariants,
  addVariantToMySupply,
} from "@/modules/vendor/services/vendor-products.service";

function isPoStatus(s: string | null): s is VendorPoStatusFilter {
  return (
    s != null &&
    (VENDOR_PO_STATUS_FILTERS as readonly string[]).includes(s)
  );
}

export async function GET(request: Request) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const tab = searchParams.get("tab") === "add" ? "add" : "my";
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  try {
    const { data, total } =
      tab === "add"
        ? await listAvailableCatalogVariants(page)
        : await listMyVendorProducts(page);

    return NextResponse.json({
      data,
      total,
      page,
      tab,
    });
  } catch (error) {
    console.error("Error fetching vendor products:", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireVendorApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();

    if (!body.variantId || typeof body.variantId !== "string") {
      return NextResponse.json(
        { error: "variantId is required" },
        { status: 400 },
      );
    }

    if (
      typeof body.basePrice !== "number" ||
      body.basePrice <= 0
    ) {
      return NextResponse.json(
        { error: "basePrice must be a positive number" },
        { status: 400 },
      );
    }

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

    await addVariantToMySupply(body.variantId, {
      basePrice: body.basePrice,
      stock: body.stock,
    });

    return NextResponse.json({
      ok: true,
      message: "Variant added to supply successfully",
    });
  } catch (error) {
    console.error("Error adding variant to supply:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to add variant" },
      { status: 500 },
    );
  }
}
