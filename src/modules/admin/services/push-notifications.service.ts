import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type {
  PushAudience,
  PushCampaignRow,
  PushCampaignStatus,
  PushTemplateRow,
  PushTopic,
} from "@/modules/admin/services/push-notifications.types";

export type { PushAudience, PushCampaignRow, PushCampaignStatus, PushTemplateRow, PushTopic };

export type NotificationPreferences = {
  user_id: string;
  push_enabled: boolean;
  order_updates: boolean;
  promotions: boolean;
  wallet_updates: boolean;
  sound_enabled: boolean;
  badge_enabled: boolean;
};

type TokenRow = {
  id: string;
  user_id: string;
  expo_push_token: string;
};

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export const ORDER_STATUS_EVENT: Record<string, string> = {
  pending: "order.placed",
  processing: "order.confirmed",
  shipped: "order.shipped",
  delivered: "order.delivered",
  cancelled: "order.cancelled",
};

export function interpolateTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => vars[key] ?? "");
}

function topicAllowed(topic: PushTopic, prefs: NotificationPreferences | null): boolean {
  if (!prefs) return true;
  if (!prefs.push_enabled) return false;
  if (topic === "order") return prefs.order_updates;
  if (topic === "promo") return prefs.promotions;
  if (topic === "wallet") return prefs.wallet_updates;
  return true;
}

async function sendExpoChunk(
  messages: Array<Record<string, unknown>>,
): Promise<{ ok: number; fail: number; invalidTokens: string[] }> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });
  const json = (await res.json()) as {
    data?: Array<{ status?: string; details?: { error?: string } }>;
  };
  let ok = 0;
  let fail = 0;
  const invalidTokens: string[] = [];
  const tickets = json.data ?? [];
  tickets.forEach((ticket, index) => {
    if (ticket.status === "ok") {
      ok += 1;
      return;
    }
    fail += 1;
    const token = String(messages[index]?.to ?? "");
    if (ticket.details?.error === "DeviceNotRegistered" && token) {
      invalidTokens.push(token);
    }
  });
  if (tickets.length === 0) fail += messages.length;
  return { ok, fail, invalidTokens };
}

async function loadPrefs(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userIds: string[],
) {
  const prefsByUser = new Map<string, NotificationPreferences>();
  if (userIds.length === 0) return prefsByUser;
  const { data } = await supabase
    .from("notification_preferences")
    .select("user_id, push_enabled, order_updates, promotions, wallet_updates, sound_enabled, badge_enabled")
    .in("user_id", userIds);
  for (const prefs of (data ?? []) as NotificationPreferences[]) {
    prefsByUser.set(prefs.user_id, prefs);
  }
  return prefsByUser;
}

async function loadCustomerTokens(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userIds?: string[],
): Promise<TokenRow[]> {
  let query = supabase.from("push_tokens").select("id, user_id, expo_push_token").eq("is_active", true);
  if (userIds && userIds.length > 0) query = query.in("user_id", userIds);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const tokenRows = (data ?? []) as TokenRow[];
  const ids = [...new Set(tokenRows.map((row) => row.user_id))];
  if (ids.length === 0) return [];
  const { data: customers } = await supabase.from("users").select("id").eq("role", "customer").in("id", ids);
  const allowed = new Set((customers ?? []).map((row) => row.id as string));
  return tokenRows.filter((row) => allowed.has(row.user_id));
}

async function deliverMessages(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  rows: TokenRow[],
  input: {
    title: string;
    body: string;
    topic: PushTopic;
    href: string | null;
    sound: "default" | null;
    writeInApp: boolean;
  },
): Promise<{ sent: number; failed: number; skipped: number; notifiedUsers: string[] }> {
  const prefsByUser = await loadPrefs(supabase, [...new Set(rows.map((row) => row.user_id))]);
  const messages: Array<Record<string, unknown>> = [];
  let skipped = 0;
  const notifiedUsers = new Set<string>();

  for (const row of rows) {
    const prefs = prefsByUser.get(row.user_id) ?? null;
    if (!topicAllowed(input.topic, prefs)) {
      skipped += 1;
      continue;
    }
    messages.push({
      to: row.expo_push_token,
      title: input.title,
      body: input.body,
      sound: prefs?.sound_enabled === false || input.sound === null ? null : "default",
      badge: prefs?.badge_enabled === false ? undefined : 1,
      data: { topic: input.topic, href: input.href },
    });
    notifiedUsers.add(row.user_id);
  }

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const result = await sendExpoChunk(messages.slice(i, i + 100));
    sent += result.ok;
    failed += result.fail;
    invalidTokens.push(...result.invalidTokens);
  }
  if (invalidTokens.length > 0) {
    await supabase.from("push_tokens").update({ is_active: false }).in("expo_push_token", invalidTokens);
  }

  if (input.writeInApp) {
    const inAppType =
      input.topic === "promo"
        ? "promo"
        : input.topic === "wallet"
          ? "payment"
          : input.topic === "order"
            ? "order"
            : "system";
    for (const userId of notifiedUsers) {
      await supabase.rpc("create_notification", {
        p_user_id: userId,
        p_type: inAppType,
        p_title: input.title,
        p_message: input.body,
        p_entity_type: input.href ? "deep_link" : undefined,
        p_entity_id: undefined,
      });
    }
  }

  return { sent, failed, skipped, notifiedUsers: [...notifiedUsers] };
}

export async function listPushTemplates(): Promise<PushTemplateRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("push_templates")
    .select("id, kind, event_key, name, topic, title, body, href, sound, enabled, updated_at")
    .order("kind")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as PushTemplateRow[];
}

export async function upsertPushTemplate(input: {
  id?: string;
  kind: "automation" | "campaign";
  name: string;
  topic: PushTopic;
  title: string;
  body: string;
  href?: string | null;
  sound?: boolean;
  enabled?: boolean;
  createdBy: string;
}): Promise<PushTemplateRow> {
  const supabase = await createSupabaseServerClient();
  const payload = {
    kind: input.kind,
    name: input.name.trim(),
    topic: input.topic,
    title: input.title.trim(),
    body: input.body.trim(),
    href: input.href?.trim() || null,
    sound: input.sound === false ? "none" : "default",
    enabled: input.enabled ?? true,
    updated_at: new Date().toISOString(),
    created_by: input.createdBy,
  };
  if (!payload.name || !payload.title || !payload.body) {
    throw new Error("Name, title, and message are required.");
  }
  if (input.id) {
    const { data: existing, error: existingError } = await supabase
      .from("push_templates")
      .select("kind")
      .eq("id", input.id)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);
    if (!existing) throw new Error("Template not found.");
    const { data, error } = await supabase
      .from("push_templates")
      .update({
        ...payload,
        kind: existing.kind,
      })
      .eq("id", input.id)
      .select("id, kind, event_key, name, topic, title, body, href, sound, enabled, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data as PushTemplateRow;
  }
  const { data, error } = await supabase
    .from("push_templates")
    .insert({ ...payload, event_key: null })
    .select("id, kind, event_key, name, topic, title, body, href, sound, enabled, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data as PushTemplateRow;
}

export async function deletePushTemplate(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("push_templates").select("kind").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Template not found.");
  if (data.kind === "automation") throw new Error("Automation templates cannot be deleted. Disable them instead.");
  const { error: delError } = await supabase.from("push_templates").delete().eq("id", id);
  if (delError) throw new Error(delError.message);
}

export async function getPushOverview(): Promise<{
  activeTokens: number;
  customersWithPush: number;
  sentToday: number;
  scheduledCount: number;
  campaigns: PushCampaignRow[];
  templates: PushTemplateRow[];
}> {
  await dispatchDueCampaigns().catch(() => undefined);
  const supabase = await createSupabaseServerClient();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [{ count: activeTokens }, { data: campaigns }, templates, { data: tokenUsers }, { data: todayRows }] =
    await Promise.all([
      supabase.from("push_tokens").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase
        .from("push_campaigns")
        .select(
          "id, name, title, body, topic, audience, href, status, origin, scheduled_at, sent_count, failed_count, skipped_count, created_at, sent_at",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      listPushTemplates(),
      supabase.from("push_tokens").select("user_id").eq("is_active", true),
      supabase
        .from("push_campaigns")
        .select("sent_count")
        .gte("sent_at", startOfDay.toISOString())
        .in("status", ["sent", "partial"]),
    ]);

  const uniqueUsers = new Set((tokenUsers ?? []).map((row) => row.user_id as string));
  const sentToday = (todayRows ?? []).reduce((sum, row) => sum + Number(row.sent_count ?? 0), 0);
  const scheduledCount = (campaigns ?? []).filter((row) => row.status === "scheduled").length;

  return {
    activeTokens: activeTokens ?? 0,
    customersWithPush: uniqueUsers.size,
    sentToday,
    scheduledCount,
    campaigns: (campaigns ?? []) as PushCampaignRow[],
    templates,
  };
}

export async function saveOrSendCampaign(input: {
  createdBy: string;
  campaignId?: string;
  name?: string;
  title: string;
  body: string;
  topic: PushTopic;
  audience: PushAudience;
  userIds?: string[];
  href?: string | null;
  sound?: "default" | null;
  templateId?: string | null;
  mode: "draft" | "schedule" | "send";
  scheduledAt?: string | null;
}): Promise<{ id: string; sent: number; failed: number; skipped: number; status: string }> {
  const title = input.title.trim();
  const body = input.body.trim();
  const name = (input.name ?? title).trim();
  if (!title || !body) throw new Error("Title and message are required.");
  if (input.mode === "schedule") {
    if (!input.scheduledAt) throw new Error("Choose a schedule time.");
    if (new Date(input.scheduledAt).getTime() <= Date.now()) {
      throw new Error("Schedule time must be in the future.");
    }
  }

  const supabase = await createSupabaseServerClient();
  const base = {
    created_by: input.createdBy,
    name,
    title,
    body,
    topic: input.topic,
    audience: input.audience,
    href: input.href ?? null,
    sound: input.sound === null ? "none" : "default",
    template_id: input.templateId ?? null,
    origin: "campaign" as const,
    scheduled_at: input.mode === "schedule" ? input.scheduledAt : null,
    status: (input.mode === "send" ? "sending" : input.mode === "schedule" ? "scheduled" : "draft") as PushCampaignStatus,
  };

  let campaignId = input.campaignId;
  if (campaignId) {
    const { error } = await supabase.from("push_campaigns").update(base).eq("id", campaignId);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await supabase.from("push_campaigns").insert(base).select("id").single();
    if (error) throw new Error(error.message);
    campaignId = data.id as string;
  }

  if (input.mode !== "send") {
    return { id: campaignId, sent: 0, failed: 0, skipped: 0, status: base.status };
  }

  return dispatchCampaignById(campaignId);
}

export async function dispatchCampaignById(
  campaignId: string,
): Promise<{ id: string; sent: number; failed: number; skipped: number; status: string }> {
  const supabase = await createSupabaseServerClient();
  const { data: campaign, error } = await supabase.from("push_campaigns").select("*").eq("id", campaignId).single();
  if (error) throw new Error(error.message);
  if (campaign.status === "cancelled") throw new Error("This campaign was cancelled.");

  const rows = await loadCustomerTokens(supabase);
  const result = await deliverMessages(supabase, rows, {
    title: campaign.title as string,
    body: campaign.body as string,
    topic: campaign.topic as PushTopic,
    href: (campaign.href as string | null) ?? null,
    sound: campaign.sound === "none" ? null : "default",
    writeInApp: true,
  });

  const status: PushCampaignStatus =
    result.failed > 0 && result.sent > 0 ? "partial" : result.failed > 0 && result.sent === 0 ? "failed" : "sent";
  await supabase
    .from("push_campaigns")
    .update({
      status,
      sent_count: result.sent,
      failed_count: result.failed,
      skipped_count: result.skipped,
      sent_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  return { id: campaignId, sent: result.sent, failed: result.failed, skipped: result.skipped, status };
}

export async function cancelCampaign(id: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("push_campaigns")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "scheduled"]);
  if (error) throw new Error(error.message);
}

export async function dispatchDueCampaigns(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("push_campaigns")
    .select("id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .limit(20);
  let count = 0;
  for (const row of data ?? []) {
    await dispatchCampaignById(row.id as string);
    count += 1;
  }
  return count;
}

export async function notifyUserByEvent(input: {
  userId: string;
  eventKey: string;
  vars: Record<string, string>;
  hrefOverride?: string | null;
}): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const { data: template } = await supabase
    .from("push_templates")
    .select("topic, title, body, href, sound, enabled")
    .eq("event_key", input.eventKey)
    .eq("kind", "automation")
    .maybeSingle();
  if (!template || template.enabled === false) return;

  const title = interpolateTemplate(template.title as string, input.vars).trim();
  const body = interpolateTemplate(template.body as string, input.vars).trim();
  if (!title || !body) return;

  const hrefRaw = input.hrefOverride ?? (template.href as string | null);
  const href = hrefRaw ? interpolateTemplate(hrefRaw, input.vars) : null;
  const rows = await loadCustomerTokens(supabase, [input.userId]);
  const result = await deliverMessages(supabase, rows, {
    title,
    body,
    topic: template.topic as PushTopic,
    href: href || null,
    sound: template.sound === "none" ? null : "default",
    writeInApp: true,
  });

  await supabase.from("push_campaigns").insert({
    name: template.title,
    title,
    body,
    topic: template.topic,
    audience: "selected",
    href: href || null,
    sound: template.sound ?? "default",
    origin: "automation",
    status: result.sent > 0 ? "sent" : result.failed > 0 ? "failed" : "sent",
    sent_count: result.sent,
    failed_count: result.failed,
    skipped_count: result.skipped,
    sent_at: new Date().toISOString(),
  });
}

export async function notifyOrderStatusChange(orderId: string, status: string): Promise<void> {
  const eventKey = ORDER_STATUS_EVENT[status];
  if (!eventKey) return;
  const supabase = await createSupabaseServerClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, user_id, total_amount, status, users:users!orders_user_fkey(name)")
    .eq("id", orderId)
    .maybeSingle();
  if (!order?.user_id) return;
  const user = order.users as { name?: string | null } | { name?: string | null }[] | null;
  const customerName = (Array.isArray(user) ? user[0]?.name : user?.name) || "there";
  const amount = `₹${Number(order.total_amount ?? 0).toLocaleString("en-IN")}`;
  const orderRef = `#${String(order.id).slice(0, 8).toUpperCase()}`;
  await notifyUserByEvent({
    userId: order.user_id as string,
    eventKey,
    vars: {
      customer_name: customerName,
      order_ref: orderRef,
      amount,
      status,
      refund_note: status === "cancelled" ? " Any paid amount is returned to your wallet." : "",
    },
    hrefOverride: `/order-details/${order.id}`,
  });
}

export async function notifyWalletEvent(input: {
  userId: string;
  eventKey: "wallet.topup" | "wallet.credited" | "wallet.debited";
  amount: number;
  reference?: string;
}): Promise<void> {
  await notifyUserByEvent({
    userId: input.userId,
    eventKey: input.eventKey,
    vars: {
      amount: `₹${Number(input.amount).toLocaleString("en-IN")}`,
      reference: input.reference ?? "",
      customer_name: "there",
    },
    hrefOverride: "/wallet",
  });
}
