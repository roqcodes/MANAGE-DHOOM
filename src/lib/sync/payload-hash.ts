import { canonicalizePayload, normalizeOutboxPayload } from "@/lib/sync/payload-canonicalize";

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Client/outbox hint hash (compact JSON). Authoritative ERP hash is computed in Postgres. */
export async function hashPayload(payload: unknown): Promise<string> {
  const canonical = canonicalizePayload(normalizeOutboxPayload(payload));
  const data = new TextEncoder().encode(canonical);

  if (typeof crypto === "undefined" || !crypto.subtle?.digest) {
    throw new Error("Web Crypto SHA-256 is not available in this environment");
  }

  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToHex(digest);
}
