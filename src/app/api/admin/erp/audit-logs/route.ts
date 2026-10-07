import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  listAuditLogsForEntity,
  listRecentAuditLogs,
} from "@/modules/erp/services/audit-log.service";

export async function GET(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);

  if (searchParams.get("recent") === "1") {
    try {
      const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 50);
      const data = await listRecentAuditLogs(limit);
      return NextResponse.json({ data });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to load recent activity";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json({ error: "entityType and entityId required" }, { status: 400 });
  }
  try {
    const data = await listAuditLogsForEntity(
      entityType,
      entityId,
      parseInt(searchParams.get("limit") ?? "20", 10),
    );
    return NextResponse.json({ data });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load audit logs";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
