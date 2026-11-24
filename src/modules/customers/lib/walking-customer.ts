/** System POS / counter customer — simplified tax invoice (empty Bill To, no AR balance block). */

export const WALKING_CUSTOMER_ID = "a0000000-0000-4000-8000-000000000001";
export const WALKING_CUSTOMER_EMAIL = "walk-in@buyhub.internal";
export const WALKING_CUSTOMER_NUMBER = "WALK-IN";
export const WALKING_CUSTOMER_NAME = "Walking Customer";

export type WalkingCustomerIdentity = {
  id?: string | null;
  email?: string | null;
  customer_number?: string | null;
  user_id?: string | null;
};

export function isWalkingCustomer(
  party: WalkingCustomerIdentity | null | undefined,
): boolean {
  if (!party) return false;
  const id = party.id ?? party.user_id;
  if (id === WALKING_CUSTOMER_ID) return true;
  if (party.customer_number?.trim().toUpperCase() === WALKING_CUSTOMER_NUMBER) return true;
  if (party.email?.trim().toLowerCase() === WALKING_CUSTOMER_EMAIL) return true;
  return false;
}

export const EMPTY_PARTY_CARD = {
  name: "",
  address: "",
  street: "",
  city: "",
  phone: "",
  vatNumber: "",
} as const;