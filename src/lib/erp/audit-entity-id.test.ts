import { describe, expect, it } from "vitest";

import { normalizeAuditEntityId } from "./audit-entity-id";

describe("normalizeAuditEntityId", () => {
  it("keeps plain UUIDs", () => {
    const id = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
    expect(normalizeAuditEntityId(id)).toEqual({
      entityId: id,
      metadata: {},
    });
  });

  it("maps CBPB-prefixed batch refs to UUID + metadata", () => {
    const uuid = "a1b2c3d4-e5f6-4789-a012-3456789abcde";
    const ref = `CBPB:${uuid}`;
    const result = normalizeAuditEntityId(ref);
    expect(result.entityId).toBe(uuid);
    expect(result.metadata.reference).toBe(ref);
    expect(result.metadata.batch_ref).toBe(ref);
  });
});
