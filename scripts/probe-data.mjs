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
const headers = { apikey: key, Authorization: `Bearer ${key}` };

async function get(path) {
  const res = await fetch(`${base}/rest/v1/${path}`, { headers });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const rows = await Promise.all([
  get("app_settings?select=default_store_id&id=eq.1"),
  get("product_variants?select=id,name,product_id&limit=5"),
  get("users?select=id,email,role&limit=5"),
  get("inventory?select=variant_id,stock&limit=5"),
  get("stores?select=id,name&limit=5"),
]);

const labels = ["app_settings", "variants", "users", "inventory", "stores"];
rows.forEach((r, i) => {
  console.log(`\n=== ${labels[i]} (${r.status}) ===`);
  console.log(JSON.stringify(r.body, null, 2));
});
