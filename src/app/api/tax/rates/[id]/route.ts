import { NextResponse } from "next/server";

import {
  getTaxRateById,
  updateTaxRate,
  deleteTaxRate,
  calculateTax,
} from "@/modules/tax/services/tax-rates.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const rate = await getTaxRateById(id);

    if (!rate) {
      return NextResponse.json(
        { error: "Tax rate not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ rate });
  } catch (error) {
    console.error("Error fetching tax rate:", error);
    return NextResponse.json(
      { error: "Failed to fetch tax rate" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const updates: {
      name?: string;
      ratePercent?: number;
      description?: string;
      isDefault?: boolean;
    } = {};

    if (body.name !== undefined) {
      if (typeof body.name !== "string") {
        return NextResponse.json(
          { error: "name must be a string" },
          { status: 400 },
        );
      }
      updates.name = body.name;
    }

    if (body.ratePercent !== undefined) {
      if (
        typeof body.ratePercent !== "number" ||
        body.ratePercent < 0 ||
        body.ratePercent > 100
      ) {
        return NextResponse.json(
          { error: "ratePercent must be between 0 and 100" },
          { status: 400 },
        );
      }
      updates.ratePercent = body.ratePercent;
    }

    if (body.description !== undefined) {
      updates.description = body.description;
    }

    if (body.isDefault !== undefined) {
      updates.isDefault = body.isDefault;
    }

    await updateTaxRate(id, updates);

    const rate = await getTaxRateById(id);

    return NextResponse.json({
      ok: true,
      rate,
      message: "Tax rate updated successfully",
    });
  } catch (error) {
    console.error("Error updating tax rate:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to update tax rate" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    await deleteTaxRate(id);

    return NextResponse.json({
      ok: true,
      message: "Tax rate deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tax rate:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to delete tax rate" },
      { status: 500 },
    );
  }
}
