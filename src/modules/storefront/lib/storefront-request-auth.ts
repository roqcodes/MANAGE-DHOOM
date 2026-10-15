import "server-only";

import { createClient } from "@supabase/supabase-js";

import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { getSupabaseEnv } from "@/lib/integrations/supabase/env";
import type { Database } from "@/lib/integrations/supabase/types";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function getStorefrontUserFromRequest(
  request: Request,
): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (!jwt) return null;
    const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
    const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(jwt);
    if (error || !user) return null;
    return user;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export async function createStorefrontSupabaseForRequest(
  request: Request,
): Promise<SupabaseClient<Database>> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const jwt = authHeader.slice("Bearer ".length).trim();
    if (jwt) {
      const { supabaseUrl, supabaseAnonKey } = getSupabaseEnv();
      return createClient<Database>(supabaseUrl, supabaseAnonKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
    }
  }
  return createSupabaseServerClient();
}
