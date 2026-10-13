import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/integrations/supabase/types";

export const STOREFRONT_EMAIL_IN_USE_MESSAGE =
  "This email is already registered as a storefront customer. Use a separate email for staff portal access.";

export const PORTAL_EMAIL_IN_USE_MESSAGE =
  "This email is already registered for portal access.";

export const STOREFRONT_PHONE_IN_USE_MESSAGE =
  "This phone number is already registered as a storefront customer. Use a different number for staff access.";

export const PORTAL_PHONE_IN_USE_MESSAGE =
  "This phone number is already registered for portal access.";

function throwForStaffRegistrationReason(reason: string | undefined): void {
  switch (reason) {
    case "storefront_customer":
      throw new Error(STOREFRONT_EMAIL_IN_USE_MESSAGE);
    case "portal_exists":
      throw new Error(PORTAL_EMAIL_IN_USE_MESSAGE);
    case "storefront_customer_phone":
      throw new Error(STOREFRONT_PHONE_IN_USE_MESSAGE);
    case "portal_phone_exists":
      throw new Error(PORTAL_PHONE_IN_USE_MESSAGE);
    case "invalid_email":
      throw new Error("A valid email is required.");
    default:
      throw new Error(
        "This email or phone cannot be used for staff access. Storefront app accounts must use separate credentials.",
      );
  }
}

/** Reject staff registration when email/phone belongs to a storefront customer or existing portal user. */
export async function assertStaffPortalRegistrationAvailable(
  supabase: SupabaseClient<Database>,
  email: string,
  phone?: string,
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await (supabase as SupabaseClient).rpc(
    "check_staff_portal_registration",
    {
      p_email: normalized,
      p_phone: phone?.trim() || null,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  const result = data as { allowed?: boolean; reason?: string } | null;

  if (!result || result.allowed !== false) {
    return;
  }

  throwForStaffRegistrationReason(result.reason);
}

/** @deprecated Use `assertStaffPortalRegistrationAvailable` */
export async function assertEmailAvailableForStaffPortal(
  supabase: SupabaseClient<Database>,
  email: string,
): Promise<void> {
  await assertStaffPortalRegistrationAvailable(supabase, email);
}
