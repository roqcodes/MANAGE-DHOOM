import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const lockPath = join(process.cwd(), ".next", "dev", "lock");

if (!existsSync(lockPath)) {
  console.log("[dev:stop] No .next/dev/lock — no dev server lock recorded.");
  process.exit(0);
}

let pid;
try {
  const info = JSON.parse(readFileSync(lockPath, "utf8"));
  pid = info.pid;
} catch {
  console.warn("[dev:stop] Could not read lock file; try closing other terminals or delete .next/dev/lock manually.");
  process.exit(1);
}

if (!pid || typeof pid !== "number") {
  console.warn("[dev:stop] Lock file has no PID.");
  process.exit(1);
}

try {
  if (process.platform === "win32") {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: "inherit" });
  } else {
    execSync(`kill -TERM ${pid}`, { stdio: "inherit" });
  }
  console.log(`[dev:stop] Stopped next dev (PID ${pid}).`);
} catch {
  console.log(`[dev:stop] Process ${pid} is not running (stale lock). You can run: npm run dev`);
}
