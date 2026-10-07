import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const errors = [];

function requireFile(relativePath) {
  const full = join(root, relativePath);
  if (!existsSync(full)) {
    errors.push(`Missing file: ${relativePath}`);
    return null;
  }
  return full;
}

const icon192 = requireFile("public/icons/icon-192.png");
const icon512 = requireFile("public/icons/icon-512.png");
requireFile("src/app/manifest.ts");
requireFile("src/sw.ts");

const swPath = join(root, "public/sw.js");
if (!existsSync(swPath)) {
  errors.push(
    "public/sw.js not found — run `npm run build` to compile the service worker",
  );
} else {
  const sw = readFileSync(swPath, "utf8");
  if (!sw.includes("/api/")) {
    errors.push("Service worker should reference /api/ network-only routing");
  }
}

for (const icon of [icon192, icon512].filter(Boolean)) {
  const buf = readFileSync(icon);
  if (buf.length < 200) {
    errors.push(`Icon too small: ${icon}`);
  }
}

if (errors.length) {
  console.error("PWA Phase 1 validation failed:\n");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log("PWA Phase 1 static checks passed.");
