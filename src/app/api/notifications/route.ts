import { NextResponse } from "next/server";

import {
  getMyNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteNotification,
} from "@/modules/notifications/services/notifications.service";
import type { NotificationType } from "@/modules/notifications/services/notifications.service";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") ?? "0", 10);
    const unreadOnly = searchParams.get("unreadOnly") === "true";
    const type = searchParams.get("type") as NotificationType | null;

    const [{ data, total }, unreadCount] = await Promise.all([
      getMyNotifications({ page, unreadOnly, type: type || undefined }),
      getUnreadCount(),
    ]);

    return NextResponse.json({
      data,
      total,
      page,
      unreadCount,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (body.markAllRead === true) {
      const count = await markAllAsRead();
      return NextResponse.json({
        ok: true,
        count,
        message: `Marked ${count} notification(s) as read`,
      });
    }

    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized: User not authenticated") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("Error marking notifications read:", error);
    return NextResponse.json(
      { error: "Failed to mark notifications as read" },
      { status: 500 },
    );
  }
}
