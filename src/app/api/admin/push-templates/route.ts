import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  deletePushTemplate,
  listPushTemplates,
  upsertPushTemplate,
} from "@/modules/admin/services/push-notifications.service";
import type { PushTopic } from "@/modules/admin/services/push-notifications.types";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json({ templates: await listPushTemplates() });
  } catch (error) {
    return NextResponse.json({ error: "Failed to load templates." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as {
      id?: string;
      kind?: "automation" | "campaign";
      name?: string;
      topic?: PushTopic;
      title?: string;
      body?: string;
      href?: string | null;
      sound?: boolean;
      enabled?: boolean;
    };
    const template = await upsertPushTemplate({
      id: body.id,
      kind: body.kind ?? "campaign",
      name: body.name ?? "",
      topic: body.topic ?? "promo",
      title: body.title ?? "",
      body: body.body ?? "",
      href: body.href,
      sound: body.sound,
      enabled: body.enabled,
      createdBy: auth.profile.id,
    });
    return NextResponse.json(template);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save template." },
      { status: 400 },
    );
  }
}

export async function DELETE(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Template id is required." }, { status: 400 });
  try {
    await deletePushTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete template." },
      { status: 400 },
    );
  }
}
