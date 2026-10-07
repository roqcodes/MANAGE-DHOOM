import { NextResponse } from "next/server";

import { getAppSettings } from "@/modules/settings/services/app-settings.service";

/** Public read-only app settings (country/currency) for storefront clients. */
export async function GET() {
  try {
    const settings = await getAppSettings();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching public settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}
