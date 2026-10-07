import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getCreditLimit,
  setCreditLimit,
  checkCreditLimit,
  getCustomerLedger,
} from "@/modules/credit/services/credit-limits.service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;

  try {
    const creditInfo = await getCreditLimit(userId);

    if (!creditInfo) {
      return NextResponse.json({
        hasCreditLimit: false,
        creditLimit: 0,
        outstandingBalance: 0,
        availableCredit: 0,
      });
    }

    return NextResponse.json({
      hasCreditLimit: true,
      ...creditInfo,
    });
  } catch (error) {
    console.error("Error fetching credit limit:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit limit" },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id: userId } = await params;

  try {
    const body = await request.json();

    if (typeof body.creditLimit !== "number" || body.creditLimit < 0) {
      return NextResponse.json(
        { error: "creditLimit must be a non-negative number" },
        { status: 400 },
      );
    }

    await setCreditLimit(userId, body.creditLimit);

    const creditInfo = await getCreditLimit(userId);

    return NextResponse.json({
      ok: true,
      message: "Credit limit updated successfully",
      data: creditInfo,
    });
  } catch (error) {
    console.error("Error setting credit limit:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: "Failed to set credit limit" },
      { status: 500 },
    );
  }
}
