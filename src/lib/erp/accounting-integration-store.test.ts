import assert from "node:assert/strict";
import { test } from "node:test";

import { requireAccountingStoreId } from "./accounting-integration-store";

const STORE = "eed2fe05-36a9-492f-9bde-34d5023e2226";

test("requireAccountingStoreId returns trimmed UUID", () => {
  assert.equal(
    requireAccountingStoreId({ ACCOUNTING_STORE_ID: `  ${STORE}  ` }),
    STORE,
  );
});

test("requireAccountingStoreId fails when missing", () => {
  assert.throws(
    () => requireAccountingStoreId({}),
    /ACCOUNTING_STORE_ID is required/,
  );
});

test("requireAccountingStoreId fails on invalid UUID", () => {
  assert.throws(
    () =>
      requireAccountingStoreId({ ACCOUNTING_STORE_ID: "not-a-uuid" }),
    /must be a valid UUID/,
  );
});
