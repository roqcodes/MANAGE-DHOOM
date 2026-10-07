import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getAppSettingsForAdmin,
  updateAppSettings,
} from "@/modules/settings/services/app-settings.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const settings = await getAppSettingsForAdmin();
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error fetching app settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const settings = await updateAppSettings(body);
    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Error updating app settings:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 },
    );
  }
}
