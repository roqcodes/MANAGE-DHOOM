"use client";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Staff user id for durable outbox enqueue and sync runtime.
 * Uses the cached session first so saves work offline; falls back to getUser() when online.
 */
export async function resolveOutboxUserId(supabase: SupabaseClient): Promise<string | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const sessionUserId = sessionData.session?.user?.id;
  if (sessionUserId) {
    return sessionUserId;
  }

  try {
    const { data: userData } = await supabase.auth.getUser();
    return userData.user?.id ?? null;
  } catch {
    return null;
  }
}
