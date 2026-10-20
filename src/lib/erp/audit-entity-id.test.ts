import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeAuditEntityId } from "./audit-entity-id";

test("keeps plain UUIDs", () => {
  const id = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  assert.deepEqual(normalizeAuditEntityId(id), {
    entityId: id,
    metadata: {},
  });
});

test("maps CBPB-prefixed batch refs to UUID + metadata", () => {
  const uuid = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
  const ref = `CBPB:${uuid}`;
  const result = normalizeAuditEntityId(ref);
  assert.equal(result.entityId, uuid);
  assert.equal(result.metadata.reference, ref);
  assert.equal(result.metadata.batch_ref, ref);
});
