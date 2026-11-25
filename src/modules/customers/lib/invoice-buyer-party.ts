import type { PartyCard } from "@/modules/documents/invoice-print-copy";
import { dash } from "@/modules/documents/invoice-print-copy";

export type CustomerBuyerUserFields = {
  company_name?: string | null;
  phone?: string | null;
  trn?: string | null;
  location?: string | null;
  po_box?: string | null;
};

export type CustomerBuyerAddressFields = {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  pincode?: string | null;
  phone?: string | null;
  lookupStreet?: string | null;
  lookupCity?: string | null;
  lookupMall?: string | null;
  composedAddress?: string | null;
};

export function emptyBuyerPartyCard(): PartyCard {
  return {
    name: "—",
    address: "—",
    street: "—",
    city: "—",
    phone: "—",
    vatNumber: "—",
  };
}

/** B2B buyer block: legal company name + physical address (no contact person in address rows). */
export function buildCustomerBuyerPartyCard(
  user: CustomerBuyerUserFields | null | undefined,
  address?: CustomerBuyerAddressFields | null,
): PartyCard {
  if (!user) return emptyBuyerPartyCard();

  const name = user.company_name?.trim() || "—";

  const line1 = address?.line1?.trim() || null;
  const line2 = address?.line2?.trim() || null;
  const cityParts = [
    address?.city?.trim() || address?.lookupCity?.trim(),
    address?.state?.trim(),
    address?.pincode?.trim(),
  ].filter(Boolean);
  const cityLine = cityParts.length > 0 ? cityParts.join(", ") : null;
  const composed = address?.composedAddress?.trim() || null;

  let building: string | null;
  let street: string | null;
  let city: string | null;

  if (line1 || line2 || cityLine) {
    building = line1 || composed;
    street = line2 || address?.lookupStreet?.trim() || user.po_box?.trim() || null;
    city = cityLine || address?.lookupMall?.trim() || null;
  } else if (composed) {
    building = composed;
    street = user.po_box?.trim() || null;
    city = null;
  } else {
    building = user.location?.trim() || null;
    street = user.po_box?.trim() || null;
    city = null;
  }

  const phone = address?.phone?.trim() || user.phone?.trim() || null;

  return {
    name,
    address: dash(building),
    street: dash(street),
    city: dash(city),
    phone: dash(phone),
    vatNumber: dash(user.trn),
  };
}