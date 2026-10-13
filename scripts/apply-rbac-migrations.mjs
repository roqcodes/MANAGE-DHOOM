/**
 * Applies RBAC SQL migrations in order via Supabase CLI.
 * Prereq: `npx supabase link --project-ref szourbhrvysooaqimycb` (or your project ref).
 *
 * Usage: node scripts/apply-rbac-migrations.mjs
 * Or:    npm run db:push
 */
import { spawnSync } from "node:child_process";

const migrations = [
  "20261013100000_user_role_rbac_enum.sql",
  "20261013110000_rbac_system.sql",
  "20261013120000_rbac_session_null_safe.sql",
];

console.log("RBAC migrations to apply (via supabase db push):");
for (const m of migrations) console.log(`  - supabase/migrations/${m}`);

const result = spawnSync("npx", ["supabase", "db", "push"], {
  stdio: "inherit",
  shell: true,
  cwd: new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"),
});

process.exit(result.status ?? 1);
