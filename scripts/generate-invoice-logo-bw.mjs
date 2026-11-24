import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const input = path.join(root, "public", "DHOOM-LOGO.png");
const output = path.join(root, "public", "DHOOM-LOGO-PRINT-BW.png");

await sharp(input)
  .greyscale()
  .normalize()
  .png()
  .toFile(output);

console.log(`Wrote ${output}`);