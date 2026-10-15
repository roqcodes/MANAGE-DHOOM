import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import { resolveEntityOpen } from "@/modules/ai-assistant/lib/resolve-entity.server";
import type { RecordKind } from "@/modules/ai-assistant/lib/record-target";

const KINDS = new Set<RecordKind>([
  "customer",
  "invoice",
  "bill",
  "vendor",
  "product",
  "estimate",
  "sales-order",
  "payment",
  "employee",
]);

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      kind?: string;
      query?: string;
      tokens?: string[];
    };
    const kind = String(body.kind ?? "customer") as RecordKind;
    if (!KINDS.has(kind)) {
      return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
    }
    const query = String(body.query ?? "").trim();
    const tokens = Array.isArray(body.tokens)
      ? body.tokens.map((t) => String(t).trim()).filter(Boolean)
      : undefined;
    if (!query && (!tokens || tokens.length === 0)) {
      return NextResponse.json({ error: "Missing query" }, { status: 400 });
    }

    const resolved = await resolveEntityOpen({ kind, query, tokens });
    if (!resolved) {
      return NextResponse.json(
        { error: "No matching record found. Try the exact name or document number." },
        { status: 404 },
      );
    }
    return NextResponse.json({ data: resolved });
  } catch (error) {
    console.error("[POST /api/ai-assistant/resolve-record]", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
