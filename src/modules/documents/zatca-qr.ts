function tlv(tag: number, value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  const out = new Uint8Array(2 + encoded.length);
  out[0] = tag;
  out[1] = encoded.length;
  out.set(encoded, 2);
  return out;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export type ZatcaQrFields = {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  totalWithVat: number;
  vatAmount: number;
};

/** ZATCA Phase-1 TLV (tags 1–5), Base64. */
export function buildZatcaQrPayload(fields: ZatcaQrFields): string {
  const money = (n: number) => (Number.isFinite(n) ? n.toFixed(2) : "0.00");
  return bytesToBase64(
    concatBytes([
      tlv(1, fields.sellerName || "—"),
      tlv(2, fields.vatNumber || "—"),
      tlv(3, fields.timestampIso),
      tlv(4, money(fields.totalWithVat)),
      tlv(5, money(fields.vatAmount)),
    ]),
  );
}

export function invoiceTimestampIso(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString();
  const parsed = new Date(iso.includes("T") ? iso : `${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}
