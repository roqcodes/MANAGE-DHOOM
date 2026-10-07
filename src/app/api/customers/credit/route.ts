import { NextResponse } from "next/server";

import { getMyCreditLimit } from "@/modules/credit/services/credit-limits.service";

export async function GET() {
  try {
    const creditInfo = await getMyCreditLimit();

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
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching credit limit:", error);
    return NextResponse.json(
      { error: "Failed to fetch credit limit" },
      { status: 500 },
    );
  }
}
