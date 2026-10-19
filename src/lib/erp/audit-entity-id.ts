const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `audit_logs.entity_id` is uuid — batch refs like `CBPB:…` / `BULK:…` go in metadata. */
export function normalizeAuditEntityId(
  entityId: string | null | undefined,
  metadata: Record<string, unknown> = {},
): { entityId: string | undefined; metadata: Record<string, unknown> } {
  if (!entityId?.trim()) {
    return { entityId: undefined, metadata };
  }

  const trimmed = entityId.trim();
  if (UUID_RE.test(trimmed)) {
    return { entityId: trimmed.toLowerCase(), metadata };
  }

  const colonIdx = trimmed.indexOf(":");
  if (colonIdx > 0) {
    const suffix = trimmed.slice(colonIdx + 1).trim();
    if (UUID_RE.test(suffix)) {
      return {
        entityId: suffix.toLowerCase(),
        metadata: {
          ...metadata,
          reference: trimmed,
          batch_ref: trimmed,
        },
      };
    }
  }

  return {
    entityId: undefined,
    metadata: {
      ...metadata,
      reference: trimmed,
      entity_ref: trimmed,
    },
  };
}

export function isAuditEntityUuid(value: string | null | undefined): boolean {
  return Boolean(value?.trim() && UUID_RE.test(value.trim()));
}
