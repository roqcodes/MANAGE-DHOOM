import { NextResponse } from "next/server";

import {
  calculateTaxForOrder,
  calculateTax,
  getDefaultTaxRate,
} from "@/modules/tax/services/tax-rates.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const amount = parseFloat(searchParams.get("amount") ?? "0");
    const rateId = searchParams.get("rateId");
    const ratePercent = searchParams.get("ratePercent");

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }

    let result: {
      amount: number;
      rate_percent: number;
      tax_amount: number;
      total_amount: number;
    };

    if (rateId) {
      result = await calculateTaxForOrder(amount, rateId);
    } else if (ratePercent) {
      const rate = parseFloat(ratePercent);
      if (rate < 0 || rate > 100) {
        return NextResponse.json(
          { error: "ratePercent must be between 0 and 100" },
          { status: 400 },
        );
      }
      result = calculateTax(amount, rate);
    } else {
      result = await calculateTaxForOrder(amount);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error calculating tax:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to calculate tax" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.amount || typeof body.amount !== "number" || body.amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a positive number" },
        { status: 400 },
      );
    }

    const result = await calculateTaxForOrder(body.amount, body.rateId);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error calculating tax:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to calculate tax" },
      { status: 500 },
    );
  }
}
