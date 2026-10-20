import type { LogAuditEventInput } from "@/common/erp/types";

const SALES_DOCUMENT_ENTITY_TYPES = new Set(["invoice", "sales_order"]);

export function withSalesmanDocumentAudit(
  entityType: string,
  salesPersonId: string | undefined,
  input: Omit<LogAuditEventInput, "userId" | "salesmanId">,
): LogAuditEventInput {
  if (!salesPersonId || !SALES_DOCUMENT_ENTITY_TYPES.has(entityType)) {
    return input;
  }
  return {
    ...input,
    salesmanId: salesPersonId,
    userId: null,
  };
}

export function salesPersonIdFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const id = (payload as { salesPersonId?: string }).salesPersonId;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}
