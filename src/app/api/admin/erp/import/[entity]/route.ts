import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { importCsvEntity } from "@/modules/erp/services/erp-csv-import.service";
import type { CsvImportEntity } from "@/modules/erp/lib/csv-import-configs";
import { CSV_IMPORT_CONFIGS } from "@/modules/erp/lib/csv-import-configs";

type RouteContext = { params: Promise<{ entity: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { entity } = await context.params;
  if (!(entity in CSV_IMPORT_CONFIGS)) {
    return NextResponse.json({ error: "Unknown import entity." }, { status: 404 });
  }

  try {
    const body = await request.json();
    const csv = String(body.csv ?? "");
    const storeId = body.storeId ? String(body.storeId) : undefined;
    const result = await importCsvEntity(entity as CsvImportEntity, csv, storeId);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
