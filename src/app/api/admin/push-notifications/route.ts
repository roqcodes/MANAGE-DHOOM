import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  cancelCampaign,
  dispatchCampaignById,
  getPushOverview,
  saveOrSendCampaign,
} from "@/modules/admin/services/push-notifications.service";
import type { PushAudience, PushTopic } from "@/modules/admin/services/push-notifications.types";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(await getPushOverview());
  } catch (error) {
    console.error("Error loading push overview:", error);
    return NextResponse.json({ error: "Failed to load push notifications." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      action?: "save" | "dispatch" | "cancel";
      campaignId?: string;
      name?: string;
      title?: string;
      body?: string;
      topic?: PushTopic;
      audience?: PushAudience;
      userIds?: string[];
      href?: string | null;
      sound?: boolean;
      templateId?: string | null;
      mode?: "draft" | "schedule" | "send";
      scheduledAt?: string | null;
    };

    if (body.action === "dispatch" && body.campaignId) {
      return NextResponse.json(await dispatchCampaignById(body.campaignId));
    }
    if (body.action === "cancel" && body.campaignId) {
      await cancelCampaign(body.campaignId);
      return NextResponse.json({ ok: true });
    }

    const href = body.href?.trim() || null;
    if (href && !href.startsWith("/")) {
      return NextResponse.json({ error: "Deep link must start with /" }, { status: 400 });
    }

    const result = await saveOrSendCampaign({
      createdBy: auth.profile.id,
      campaignId: body.campaignId,
      name: body.name,
      title: body.title ?? "",
      body: body.body ?? "",
      topic: body.topic ?? "promo",
      audience: body.audience ?? "all_customers",
      userIds: body.userIds,
      href,
      sound: body.sound === false ? null : "default",
      templateId: body.templateId,
      mode: body.mode ?? "send",
      scheduledAt: body.scheduledAt,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save campaign.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
