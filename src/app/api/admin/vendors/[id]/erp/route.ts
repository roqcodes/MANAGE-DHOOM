import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { listAuditLogsForEntity } from "@/modules/erp/services/audit-log.service";
import { getAdminErpContext } from "@/modules/erp/services/store-context.service";
import {
  getVendorErpProfile,
  getVendorErpSummary,
  getVendorPurchaseBills,
  getVendorStatement,
  updateVendorErpProfile,
} from "@/modules/vendors/services/vendor-erp.service";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const view = new URL(request.url).searchParams.get("view");
  const ctx = await getAdminErpContext();
  const storeId = ctx?.store_id ?? undefined;

  try {
    if (view === "profile") {
      const profile = await getVendorErpProfile(id);
      if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(profile);
    }
    if (view === "statement") {
      const lines = await getVendorStatement(id, storeId);
      return NextResponse.json({ lines });
    }
    if (view === "purchases") {
      const page = Math.max(
        0,
        parseInt(new URL(request.url).searchParams.get("page") ?? "0", 10),
      );
      const result = await getVendorPurchaseBills(id, storeId, page);
      return NextResponse.json(result);
    }
    if (view === "activity") {
      const logs = await listAuditLogsForEntity("vendor", id);
      return NextResponse.json({ logs });
    }
    const summary = await getVendorErpSummary(id, storeId);
    return NextResponse.json(summary);
  } catch (error) {
    console.error("[GET /api/admin/vendors/[id]/erp]", error);
    return NextResponse.json({ error: "Failed to get vendor ERP data" }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    const body = await request.json();
    await updateVendorErpProfile(id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update vendor";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  return PATCH(request, context);
}
