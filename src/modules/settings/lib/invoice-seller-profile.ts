import type { Store } from "@/common/erp/types";

/** Fields shown on tax invoices (Seller block + VAT header + QR). */
export type InvoiceSellerProfile = {
  name: string;
  trn: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
  phone: string;
  logoUrl: string;
};

export function emptyInvoiceSellerProfile(): InvoiceSellerProfile {
  return {
    name: "",
    trn: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    country: "",
    pincode: "",
    phone: "",
    logoUrl: "",
  };
}

export function storeToInvoiceSellerProfile(store: Store): InvoiceSellerProfile {
  return {
    name: store.name ?? "",
    trn: store.trn ?? "",
    addressLine1: store.address_line1 ?? "",
    addressLine2: store.address_line2 ?? "",
    city: store.city ?? "",
    state: store.state ?? "",
    country: store.country ?? "",
    pincode: store.pincode ?? "",
    phone: store.phone ?? "",
    logoUrl: store.logo_url ?? "",
  };
}

export function invoiceSellerProfileToStorePayload(profile: InvoiceSellerProfile) {
  const name = profile.name.trim();
  return {
    name,
    trn: profile.trn.trim() || null,
    addressLine1: profile.addressLine1.trim() || null,
    addressLine2: profile.addressLine2.trim() || null,
    city: profile.city.trim() || null,
    state: profile.state.trim() || null,
    country: profile.country.trim() || null,
    pincode: profile.pincode.trim() || null,
    phone: profile.phone.trim() || null,
    logoUrl: profile.logoUrl.trim() || null,
  };
}

export type InvoiceSellerChecklistItem = {
  key: keyof InvoiceSellerProfile;
  label: string;
  required?: boolean;
};

export const INVOICE_SELLER_CHECKLIST: InvoiceSellerChecklistItem[] = [
  { key: "name", label: "Seller name", required: true },
  { key: "trn", label: "VAT number (TRN)", required: true },
  { key: "addressLine1", label: "Address", required: true },
  { key: "addressLine2", label: "Street name" },
  { key: "city", label: "City", required: true },
  { key: "state", label: "State / region" },
  { key: "country", label: "Country", required: true },
  { key: "pincode", label: "Postal / ZIP code" },
  { key: "phone", label: "Phone", required: true },
];

export function missingInvoiceSellerFields(
  profile: InvoiceSellerProfile,
): InvoiceSellerChecklistItem[] {
  return INVOICE_SELLER_CHECKLIST.filter((item) => {
    if (!item.required) return false;
    const v = profile[item.key]?.trim() ?? "";
    return !v;
  });
}

/** City line on printed invoice: city, region, country, postal. */
export function formatInvoiceSellerCityLine(parts: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
}): string {
  return [parts.city, parts.state, parts.country, parts.pincode]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
}