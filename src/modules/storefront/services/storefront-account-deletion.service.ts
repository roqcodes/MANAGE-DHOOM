import "server-only";

import { createSupabaseAdminClient } from "@/lib/integrations/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/integrations/supabase/types";

export type StorefrontDeletionPreview = {
  can_delete: boolean;
  reason: string | null;
  message: string;
  active_orders?: number;
  open_returns?: number;
  wallet_balance?: number;
};

/** Until generated DB types include storefront RPCs (apply migration + regen types). */
async function rpcStorefront(
  supabase: SupabaseClient<Database>,
  fn: "storefront_account_deletion_preview" | "storefront_delete_own_account",
  args?: Record<string, unknown>,
) {
  const client = supabase as SupabaseClient<Database> & {
    rpc: (
      name: string,
      params?: Record<string, unknown>,
    ) => ReturnType<SupabaseClient<Database>["rpc"]>;
  };
  return client.rpc(fn, args);
}

export async function getStorefrontDeletionPreview(
  supabase: SupabaseClient<Database>,
): Promise<StorefrontDeletionPreview> {
  const { data, error } = await rpcStorefront(
    supabase,
    "storefront_account_deletion_preview",
  );
  if (error) throw new Error(error.message);
  const row = data as Record<string, unknown> | null;
  return {
    can_delete: row?.can_delete === true,
    reason: typeof row?.reason === "string" ? row.reason : null,
    message:
      typeof row?.message === "string"
        ? row.message
        : "Unable to check account deletion status.",
    active_orders:
      typeof row?.active_orders === "number" ? row.active_orders : undefined,
    open_returns:
      typeof row?.open_returns === "number" ? row.open_returns : undefined,
    wallet_balance:
      typeof row?.wallet_balance === "number" ? row.wallet_balance : undefined,
  };
}

export async function deleteStorefrontAccountForUser(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<void> {
  const preview = await getStorefrontDeletionPreview(supabase);
  if (!preview.can_delete) {
    throw new Error(preview.message);
  }

  const { error: rpcError } = await rpcStorefront(
    supabase,
    "storefront_delete_own_account",
  );
  if (rpcError) throw new Error(rpcError.message);

  const admin = createSupabaseAdminClient();
  if (!admin) {
    throw new Error(
      "Account data was removed but sign-in could not be deleted (server configuration). Contact support.",
    );
  }

  const { error: authError } = await admin.auth.admin.deleteUser(userId);
  if (authError) {
    throw new Error(
      `Profile removed but sign-in may remain: ${authError.message}. Contact support.`,
    );
  }
}
