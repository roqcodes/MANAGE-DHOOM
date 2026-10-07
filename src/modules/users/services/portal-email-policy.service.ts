import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/integrations/supabase/types";

const STAFF_ROLES = ["admin", "manager", "vendor", "delivery"] as const;

export const STOREFRONT_EMAIL_IN_USE_MESSAGE =
  "This email is already registered as a storefront customer. Use a separate email for staff portal access.";

export const PORTAL_EMAIL_IN_USE_MESSAGE =
  "This email is already registered for portal access.";

/** Reject staff sign-up when the email belongs to an existing storefront customer. */
export async function assertEmailAvailableForStaffPortal(
  supabase: SupabaseClient<Database>,
  email: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase
    .from("users")
    .select("id, role")
    .ilike("email", normalized)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return;
  }

  if (!data.role) {
    throw new Error(STOREFRONT_EMAIL_IN_USE_MESSAGE);
  }

  if ((STAFF_ROLES as readonly string[]).includes(data.role)) {
    throw new Error(PORTAL_EMAIL_IN_USE_MESSAGE);
  }
}
