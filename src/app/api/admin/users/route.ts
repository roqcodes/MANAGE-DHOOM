import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getPendingPortalRequests,
  getPendingPortalRequestCount,
  getPortalStaffUsers,
  getTeamCatalogStats,
  type PortalStaffSegment,
} from "@/modules/users/services/users.service";

type PrimaryTab = "users" | "requests";
type UserSegment = PortalStaffSegment;

function resolveStaffSegment(segmentParam: string | null): UserSegment {
  if (segmentParam === "vendor" || segmentParam === "delivery" || segmentParam === "admin") {
    return segmentParam;
  }
  return "vendor";
}

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const primary: PrimaryTab =
    searchParams.get("tab") === "requests" ? "requests" : "users";
  const segment = resolveStaffSegment(searchParams.get("segment"));
  const page = Math.max(0, parseInt(searchParams.get("page") ?? "0", 10));

  if (primary === "requests") {
    const [pending, stats] = await Promise.all([
      getPendingPortalRequests(),
      getTeamCatalogStats(),
    ]);
    return NextResponse.json({
      pendingCount: pending.length,
      primary,
      segment,
      page,
      stats,
      content: { kind: "requests" as const, pending },
    });
  }

  const [pendingCount, stats, content] = await Promise.all([
    getPendingPortalRequestCount(),
    getTeamCatalogStats(),
    (async () => {
      if (segment === "vendor") {
        return { kind: "vendor" as const, ...(await getPortalStaffUsers("vendor", page)) };
      }
      if (segment === "delivery") {
        return {
          kind: "delivery" as const,
          ...(await getPortalStaffUsers("delivery", page)),
        };
      }
      return { kind: "admin" as const, ...(await getPortalStaffUsers("admin", page)) };
    })(),
  ]);

  return NextResponse.json({
    pendingCount,
    primary,
    segment,
    page,
    stats,
    content,
  });
}
