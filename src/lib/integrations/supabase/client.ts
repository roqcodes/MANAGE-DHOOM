"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getSupabaseEnv, getSupabaseEnvOptional } from "@/lib/integrations/supabase/env";
import type { Database } from "@/lib/integrations/supabase/types";

let browserClient: ReturnType<typeof createBrowserClient<Database>> | undefined;

/** Single browser client per tab — avoids duplicate auth/session listeners. */
export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
  browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  return browserClient;
}

/** Returns null when public Supabase env is not embedded in the client bundle. */
export function tryCreateSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const env = getSupabaseEnvOptional();
  if (!env) return null;

  browserClient = createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
  return browserClient;
}
