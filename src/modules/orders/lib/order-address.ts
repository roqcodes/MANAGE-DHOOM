import type { OrderAddress } from "@/common/admin/types";

export function formatAddressLine(address: {
  line1?: string | null;
  line2?: string | null;
  address_line?: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
}) {
  const street = address.line1 ?? address.address_line;
  return [street, address.line2, address.city, address.state, address.pincode]
    .filter(Boolean)
    .join(", ");
}

export function normalizeOrderAddress(
  row: Record<string, unknown> | null | undefined,
): OrderAddress | null {
  if (!row) return null;

  const str = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : null;

  const line1 = str(row.line1) ?? str(row.address_line);

  return {
    label: str(row.label),
    address_line: str(row.address_line),
    line1,
    line2: str(row.line2),
    city: str(row.city),
    state: str(row.state),
    pincode: str(row.pincode),
    phone: str(row.phone),
    latitude:
      row.latitude != null && row.latitude !== ""
        ? Number(row.latitude)
        : null,
    longitude:
      row.longitude != null && row.longitude !== ""
        ? Number(row.longitude)
        : null,
  };
}
