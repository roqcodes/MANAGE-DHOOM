import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataMod = pathToFileURL(
  join(root, "src/modules/ai-assistant/lib/app-sitemap-data.ts"),
).href;

const { buildSitemapPages } = await import(dataMod);
const pages = buildSitemapPages();
const outDir = join(root, "src/modules/ai-assistant/data");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, "app-sitemap.json");
writeFileSync(
  out,
  `${JSON.stringify({ version: 1, pages }, null, 0)}\n`,
  "utf8",
);
console.log(`Wrote ${pages.length} pages to ${out}`);
