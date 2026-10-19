/**
 * Regenerates square PWA icons (Chromium installability requires correct sizes).
 * Run: node scripts/generate-pwa-icons.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const source = join(root, "public", "icon.png");
const iconsDir = join(root, "public", "icons");

const input = readFileSync(source);

async function writeIcon(name, size, paddingPercent = 0) {
  const inner = Math.round(size * (1 - paddingPercent * 2));
  const resized = await sharp(input)
    .resize(inner, inner, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .extend({
      top: Math.floor((size - inner) / 2),
      bottom: Math.ceil((size - inner) / 2),
      left: Math.floor((size - inner) / 2),
      right: Math.ceil((size - inner) / 2),
      background: { r: 248, g: 250, b: 252, alpha: 1 },
    })
    .png()
    .toBuffer();

  const out = join(iconsDir, name);
  writeFileSync(out, resized);
  const meta = await sharp(resized).metadata();
  console.log(`Wrote ${name} (${meta.width}x${meta.height})`);
}

await writeIcon("icon-192.png", 192);
await writeIcon("icon-512.png", 512);
await writeIcon("icon-maskable-512.png", 512, 0.1);
