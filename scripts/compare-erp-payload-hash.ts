import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";

import {
  canonicalizePayload,
  canonicalizePayloadForErpHash,
  normalizeOutboxPayload,
} from "../src/lib/sync/payload-canonicalize";
import { hashPayload } from "../src/lib/sync/payload-hash";

function loadEnv(name: string): string {
  const env = readFileSync(".env", "utf8");
  const match = env.match(new RegExp(`^${name}=(.+)$`, "m"));
  if (!match) throw new Error(`Missing ${name} in .env`);
  return match[1].trim();
}

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function main(): Promise<void> {
  const supabase = createClient(
    loadEnv("NEXT_PUBLIC_SUPABASE_URL"),
    loadEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );

  const nested = {
    items: [
      {
        productId: "c902f33a-0e0e-46ae-8f12-643530ebed99",
        quantity: 10,
        taxRatePercent: 0,
        unitPrice: 10,
      },
    ],
  };
  const { data: nestedPg } = await supabase.rpc("erp_payload_hash", {
    p_payload: nested,
  });
  const arrayOnly = [{ productId: "c902f33a-0e0e-46ae-8f12-643530ebed99", quantity: 10 }];
  const { data: arrayPg } = await supabase.rpc("erp_payload_hash", {
    p_payload: arrayOnly,
  });
  const arrayCandidates = [
    '[{"productId": "c902f33a-0e0e-46ae-8f12-643530ebed99", "quantity": 10}]',
    '[{"productId":"c902f33a-0e0e-46ae-8f12-643530ebed99","quantity":10}]',
    canonicalizePayload(arrayOnly),
    canonicalizePayloadForErpHash(arrayOnly),
  ];
  for (const t of arrayCandidates) {
    const h = await sha256(t);
    if (h === arrayPg) console.log("ARRAY MATCH", t);
  }
  console.log("array pg", arrayPg);

  const nestedTexts = [
    canonicalizePayload(nested),
    canonicalizePayloadForErpHash(nested),
    `{"items": [{"productId": "c902f33a-0e0e-46ae-8f12-643530ebed99", "quantity": 10, "taxRatePercent": 0, "unitPrice": 10}]}`,
    `{"items":[{"productId": "c902f33a-0e0e-46ae-8f12-643530ebed99", "quantity": 10, "taxRatePercent": 0, "unitPrice": 10}]}`,
  ];
  for (const t of nestedTexts) {
    const h = await sha256(t);
    if (h === nestedPg) console.log("NESTED MATCH", t);
  }
  console.log("nested pg", nestedPg);

  for (const sample of [{ a: 1 }, { a: 1, b: 2 }]) {
    const { data: pgHash } = await supabase.rpc("erp_payload_hash", {
      p_payload: sample,
    });
    const candidates = [
      JSON.stringify(sample),
      JSON.stringify({ a: 1 }),
      '{"a": 1}',
      '{"a": 1, "b": 2}',
      canonicalizePayloadForErpHash(sample),
    ];
    for (const c of candidates) {
      const h = await sha256(c);
      if (h === pgHash) {
        console.log("MATCH sample", sample, "text:", c);
      }
    }
    console.log("sample", sample, "pgHash", pgHash);
  }

  const payload = normalizeOutboxPayload({
    userId: "d019d28d-1db5-45c3-ad86-da9653e1d243",
    subtotal: 100,
    tax: 0,
    discount: 0,
    totalAmount: 100,
    taxInclusive: true,
    items: [
      {
        productId: "c902f33a-0e0e-46ae-8f12-643530ebed99",
        quantity: 10,
        unitPrice: 10,
        taxRatePercent: 0,
      },
    ],
  });

  const jsHash = await hashPayload(payload);
  console.log("canonical:", canonicalizePayloadForErpHash(payload));
  const { data, error } = await supabase.rpc("erp_payload_hash", {
    p_payload: payload,
  });

  console.log("jsHash:", jsHash);
  console.log("pgHash:", data);
  console.log("match:", jsHash === data);
  if (error) {
    console.error("rpc error:", error.message);
    process.exit(1);
  }
  if (jsHash !== data) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
