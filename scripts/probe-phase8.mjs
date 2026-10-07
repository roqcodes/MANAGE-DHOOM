import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envText = readFileSync(resolve(__dirname, "../.env"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const base = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
};

async function get(path) {
  const res = await fetch(`${base}/rest/v1/${path}`, { headers });
  const text = await res.text();
  return { status: res.status, body: text };
}

async function rpc(name, args = {}) {
  const res = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(args),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

const checks = [];

checks.push(["store_inventory+reserved_stock", await get("store_inventory?select=store_id,stock,reserved_stock&limit=1")]);
checks.push(["orders+fulfillment cols", await get("orders?select=id,fulfillment_status,inventory_reserved&limit=1")]);
checks.push(["order_fulfillments", await get("order_fulfillments?select=id&limit=1")]);
checks.push(["stores", await get("stores?select=id,name,is_active&limit=5")]);
checks.push(["products", await get("products?select=id,name&limit=3")]);
checks.push(["rpc get_variant_online_available", await rpc("get_variant_online_available", { p_variant_id: "00000000-0000-0000-0000-000000000001" })]);
checks.push(["rpc setup_order_fulfillments (expect auth err)", await rpc("setup_order_fulfillments_and_reserve", { p_order_id: "00000000-0000-0000-0000-000000000001" })]);

for (const [name, r] of checks) {
  console.log(`\n=== ${name} ===`);
  console.log(`status: ${r.status}`);
  console.log(r.body.slice(0, 500));
}
