import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { getAllNotifications } from "@/modules/notifications/services/notifications.service";
import type { NotificationType } from "@/modules/notifications/services/notifications.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const type = searchParams.get("type") as NotificationType | null;

    const { data, total } = await getAllNotifications(page, type || undefined);

    return NextResponse.json({
      data,
      total,
      page,
    });
  } catch (error) {
    console.error("Error fetching all notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}
