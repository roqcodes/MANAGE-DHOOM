import "server-only";

import { cookies } from "next/headers";
import type { PostgrestError } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { PRESENCE_COOKIE_NAME } from "@/modules/presence/lib/presence-constants";
import type {
  PresenceEndReason,
  PresenceSessionRow,
} from "@/modules/presence/types";

export class PresenceSessionError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = "PresenceSessionError";
    this.code = code;
  }
}

function toPresenceError(error: PostgrestError | null): PresenceSessionError {
  return new PresenceSessionError(
    error?.message ?? "Presence session request failed.",
    error?.code ?? null,
  );
}

/** True when the migration has not been applied yet — degrade gracefully. */
export function isMissingPresenceSchemaError(error: unknown): boolean {
  if (!(error instanceof PresenceSessionError)) return false;

  const code = error.code ?? "";
  if (code === "42883" || code === "42P01" || code === "PGRST202") return true;

  const message = error.message.toLowerCase();
  return (
    message.includes("could not find the function") ||
    message.includes("schema cache") ||
    message.includes("does not exist")
  );
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function readPresenceCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(PRESENCE_COOKIE_NAME)?.value ?? null;
}

/** Mirrors the client key into an HttpOnly cookie for server-side sign-out. */
export async function writePresenceCookie(sessionKey: string): Promise<void> {
  const store = await cookies();
  store.set(PRESENCE_COOKIE_NAME, sessionKey, COOKIE_OPTIONS);
}

export async function clearPresenceCookie(): Promise<void> {
  const store = await cookies();
  store.set(PRESENCE_COOKIE_NAME, "", { ...COOKIE_OPTIONS, maxAge: 0 });
}

export async function startPresenceSession(
  sessionKey: string,
  userAgent: string | null,
  tabId: string,
  generationId: string,
): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("start_presence_session", {
    p_session_key: sessionKey,
    p_user_agent: userAgent,
    p_tab_id: tabId,
    p_generation_id: generationId,
  });

  if (error) throw toPresenceError(error);
  return data;
}

export async function pingPresenceSession(
  sessionKey: string,
  tabId: string | null = null,
  generationId: string | null = null,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("ping_presence_session", {
    p_session_key: sessionKey,
    p_tab_id: tabId ?? undefined,
    p_generation_id: generationId ?? undefined,
  });

  if (error) throw toPresenceError(error);
  return data === true;
}

export async function endPresenceSession(
  sessionKey: string,
  reason: PresenceEndReason,
  startedAt: string | null,
  tabId: string | null,
  generationId: string | null,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("end_presence_session", {
    p_session_key: sessionKey,
    p_reason: reason,
    p_started_at: startedAt,
    p_tab_id: tabId,
    p_generation_id: generationId,
  });

  if (error) throw toPresenceError(error);
  return data === true;
}

export async function getPresenceSessions(
  days: number,
  limit: number,
): Promise<PresenceSessionRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_presence_sessions", {
    p_days: days,
    p_limit: limit,
  });

  if (error) throw toPresenceError(error);
  return (data ?? []) as PresenceSessionRow[];
}
