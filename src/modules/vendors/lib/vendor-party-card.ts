import type { PartyCard } from "@/modules/documents/invoice-print-copy";
import { dash } from "@/modules/documents/invoice-print-copy";

export type VendorPartySource = {
  name?: string | null;
  address?: string | null;
  po_box?: string | null;
  phone?: string | null;
  trn?: string | null;
  /** Contact person — not used as street/address on tax documents. */
  contact?: string | null;
};

/** Supplier / seller party on purchase tax documents (vendor legal name + registered address). */
export function buildVendorPartyCard(vendor: VendorPartySource | null | undefined): PartyCard {
  if (!vendor) {
    return {
      name: "—",
      address: "—",
      street: "—",
      city: "—",
      phone: "—",
      vatNumber: "—",
    };
  }

  return {
    name: dash(vendor.name),
    address: dash(vendor.address),
    street: dash(vendor.po_box),
    city: "—",
    phone: dash(vendor.phone),
    vatNumber: dash(vendor.trn),
  };
}