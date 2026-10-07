/** Next.js only inlines `process.env.NEXT_PUBLIC_*` for static property access (not `process.env[name]`). */

/** Client-safe read; returns null instead of throwing (typeahead can fall back to API routes). */
export function getSupabaseEnvOptional() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return { supabaseUrl, supabaseAnonKey };
}

export function getSupabaseEnv() {
  const env = getSupabaseEnvOptional();
  if (!env) {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      throw new Error("Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL");
    }
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)",
    );
  }
  return env;
}
