import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/integrations/supabase/types";
import type { PartyCard } from "@/modules/documents/invoice-print-copy";
import {
  buildCustomerBuyerPartyCard,
  type CustomerBuyerUserFields,
  emptyBuyerPartyCard,
} from "@/modules/customers/lib/invoice-buyer-party";
import { resolveCustomerAddressProfile } from "@/modules/customers/services/customer-address-lookup.service";

export type InvoiceBuyerUser = CustomerBuyerUserFields;

/** Tax invoice Bill To — company + default customer address from DB. */
export async function resolveInvoiceBuyerParty(
  supabase: SupabaseClient<Database>,
  userId: string | null | undefined,
  user: InvoiceBuyerUser | null | undefined,
): Promise<PartyCard> {
  if (!user) return emptyBuyerPartyCard();

  let addressRow: {
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    pincode?: string | null;
    phone?: string | null;
    city_id?: string | null;
    mall_id?: string | null;
    street_id?: string | null;
  } | null = null;

  if (userId) {
    const { data } = await supabase
      .from("addresses")
      .select("line1, line2, city, state, pincode, phone, city_id, mall_id, street_id")
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();
    addressRow = data;
  }

  const { lookupNames, composedAddress } = await resolveCustomerAddressProfile(
    supabase,
    {
      cityId: addressRow?.city_id,
      streetId: addressRow?.street_id,
      mallId: addressRow?.mall_id,
    },
    addressRow ?? undefined,
  );

  return buildCustomerBuyerPartyCard(user, {
    line1: addressRow?.line1,
    line2: addressRow?.line2,
    city: addressRow?.city,
    state: addressRow?.state,
    pincode: addressRow?.pincode,
    phone: addressRow?.phone,
    lookupStreet: lookupNames.street,
    lookupCity: lookupNames.city,
    lookupMall: lookupNames.mall,
    composedAddress,
  });
}