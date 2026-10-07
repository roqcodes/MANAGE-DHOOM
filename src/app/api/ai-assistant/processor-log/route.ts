import { NextResponse } from "next/server";

import {
  type AiProcessorLogDetails,
  writeAiProcessorLog,
} from "@/modules/ai-assistant/lib/ai-processor-log";

/** Dev metrics only — no Supabase auth round-trip per log line. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: AiProcessorLogDetails;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body?.processor !== "api" && body?.processor !== "local" && body?.processor !== "heuristic") {
    return NextResponse.json({ error: "Invalid processor." }, { status: 400 });
  }

  writeAiProcessorLog(body);
  return NextResponse.json({ ok: true });
}
