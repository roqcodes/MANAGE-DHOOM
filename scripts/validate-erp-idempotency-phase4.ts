import { execSync } from "node:child_process";

import { hashPayload } from "../src/lib/sync/payload-hash";
import { canonicalizePayload } from "../src/lib/sync/payload-canonicalize";
import {
  ErpClientOperationConflictError,
  mapRpcErrorToClientOperationError,
} from "../src/lib/erp/client-operations/errors";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function run(): Promise<void> {
  const hashA = await hashPayload({ z: 1, a: 2 });
  const hashB = await hashPayload({ a: 2, z: 1 });
  assert(hashA === hashB, "canonical payload hash is deterministic");
  assert(
    canonicalizePayload({ b: 1, a: 2 }) === '{"a":2,"b":1}',
    "canonical JSON matches Phase 2 rules",
  );

  const conflict = mapRpcErrorToClientOperationError({
    message: "ERP_CLIENT_PAYLOAD_HASH_CONFLICT",
  });
  assert(
    conflict instanceof ErpClientOperationConflictError,
    "maps payload hash conflict to 409 class",
  );

  execSync("npm run outbox:validate", { stdio: "inherit", cwd: process.cwd() });
  execSync("npm run outbox:validate:sync", { stdio: "inherit", cwd: process.cwd() });

  console.log("Phase 4 TypeScript idempotency checks passed.");
  console.log(
    "Database certification: apply migration 20261003120000_erp_client_operations_idempotency.sql then run scripts/run-erp-client-operations-tests.sql in Supabase SQL editor (not executed in this script).",
  );
}

run().catch((error) => {
  console.error("Phase 4 idempotency validation failed:");
  console.error(error);
  process.exit(1);
});
