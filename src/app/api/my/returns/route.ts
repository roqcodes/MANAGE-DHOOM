import { NextResponse } from "next/server";

import {
  getMyReturns,
  createReturn,
} from "@/modules/returns/services/returns.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);

    const { data, total } = await getMyReturns(page);

    return NextResponse.json({
      data,
      total,
      page,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching my returns:", error);
    return NextResponse.json(
      { error: "Failed to fetch returns" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.orderId || typeof body.orderId !== "string") {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400 },
      );
    }

    if (!body.orderItemId || typeof body.orderItemId !== "string") {
      return NextResponse.json(
        { error: "orderItemId is required" },
        { status: 400 },
      );
    }

    if (!body.variantId || typeof body.variantId !== "string") {
      return NextResponse.json(
        { error: "variantId is required" },
        { status: 400 },
      );
    }

    if (
      typeof body.quantity !== "number" ||
      body.quantity < 1 ||
      !Number.isInteger(body.quantity)
    ) {
      return NextResponse.json(
        { error: "quantity must be a positive integer" },
        { status: 400 },
      );
    }

    if (!body.reason || typeof body.reason !== "string") {
      return NextResponse.json(
        { error: "reason is required" },
        { status: 400 },
      );
    }

    const returnRow = await createReturn(
      body.orderId,
      body.orderItemId,
      body.variantId,
      body.quantity,
      body.reason,
    );

    return NextResponse.json({
      ok: true,
      data: returnRow,
      message: "Return request created successfully",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error creating return:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { ok: false, error: "Failed to create return" },
      { status: 500 },
    );
  }
}
