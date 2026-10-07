import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

type RpcClient = {
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): ReturnType<SupabaseClient["rpc"]>;
};

/** Call RPCs not yet present in generated Database types (post-migration). */
export function invokeRpc(
  supabase: SupabaseClient,
  fn: string,
  args: Record<string, unknown> = {},
) {
  return (supabase as unknown as RpcClient).rpc(fn, args);
}
