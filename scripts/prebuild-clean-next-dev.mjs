import { rmSync } from "node:fs";
import { join } from "node:path";

const target = join(process.cwd(), ".next", "dev");
const ignorable = new Set(["EPERM", "EBUSY", "ENOTEMPTY", "ENOENT"]);

const attempts = 8;
for (let i = 0; i < attempts; i++) {
  try {
    rmSync(target, { recursive: true, force: true, maxRetries: 8, retryDelay: 400 });
    process.exit(0);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    if (!ignorable.has(code)) {
      throw error;
    }
    if (i === attempts - 1) {
      console.warn(
        "[prebuild] Could not remove .next/dev (stop `npm run dev` if this persists). Continuing build.",
      );
      process.exit(0);
    }
    const waitMs = 150 * (i + 1);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, waitMs);
  }
}
