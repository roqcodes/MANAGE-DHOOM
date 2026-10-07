import "server-only";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import type { Paginated } from "@/common/admin/types";
import { PAGE_SIZE } from "@/common/admin/types";

export type NotificationType =
  | "order"
  | "payment"
  | "inventory"
  | "procurement"
  | "system"
  | "return";

export interface NotificationRow {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  read_at: string | null;
}

export interface GetNotificationsOptions {
  page?: number;
  unreadOnly?: boolean;
  type?: NotificationType;
}

export async function getMyNotifications(
  options: GetNotificationsOptions = {},
): Promise<Paginated<NotificationRow>> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();
  const from = (options.page ?? 0) * PAGE_SIZE;

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (options.unreadOnly) {
    query = query.eq("is_read", false);
  }

  if (options.type) {
    query = query.eq("type", options.type);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as NotificationRow[],
    total: count ?? 0,
  };
}

export async function getUnreadCount(): Promise<number> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", profile.id)
    .eq("is_read", false);

  if (error) throw new Error(error.message);

  return count ?? 0;
}

export async function markAsRead(notificationId: string): Promise<void> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await (supabase.rpc as any)("mark_notification_read", {
    p_notification_id: notificationId,
    p_user_id: profile.id,
  });

  if (error) throw new Error(error.message);
}

export async function markAllAsRead(): Promise<number> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.rpc as any)("mark_all_notifications_read", {
    p_user_id: profile.id,
  });

  if (error) throw new Error(error.message);

  return (data as number) ?? 0;
}

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  entityType?: string,
  entityId?: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await (supabase.rpc as any)("create_notification", {
    p_user_id: userId,
    p_type: type,
    p_title: title,
    p_message: message,
    p_entity_type: entityType ?? null,
    p_entity_id: entityId ?? null,
  });

  if (error) throw new Error(error.message);

  return data as string;
}

export async function deleteNotification(
  notificationId: string,
): Promise<void> {
  const { profile } = await getCurrentSessionProfile();

  if (!profile) {
    throw new Error("Unauthorized: User not authenticated");
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", notificationId)
    .eq("user_id", profile.id);

  if (error) throw new Error(error.message);
}

export async function getAllNotifications(
  page = 0,
  type?: NotificationType,
): Promise<Paginated<NotificationRow>> {
  await requireAdminApiProfile();

  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;

  let query = supabase
    .from("notifications")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (type) {
    query = query.eq("type", type);
  }

  const { data, count, error } = await query;

  if (error) throw new Error(error.message);

  return {
    data: (data ?? []) as NotificationRow[],
    total: count ?? 0,
  };
}
