import type { LogAuditEventInput } from "@/common/erp/types";

function stableValue(value: unknown): string {
  if (value === undefined) return "";
  if (value === null) return "null";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value).trim();
}

export function formatAuditScalar(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "—";
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const text = String(value).trim();
  if (text.length > 100) return `${text.slice(0, 97)}…`;
  return text;
}

export function summarizeAuditChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fieldLabels: Record<string, string>,
): string[] {
  const changes: string[] = [];
  for (const [key, label] of Object.entries(fieldLabels)) {
    const oldVal = before[key];
    const newVal = after[key];
    if (stableValue(oldVal) === stableValue(newVal)) continue;
    changes.push(`${label}: ${formatAuditScalar(oldVal)} → ${formatAuditScalar(newVal)}`);
  }
  return changes;
}

export function formatAuditChangesList(changes: string[], maxItems = 8): string {
  if (changes.length === 0) return "";
  const shown = changes.slice(0, maxItems);
  const rest = changes.length - shown.length;
  const body = shown.join("; ");
  return rest > 0 ? `${body}; +${rest} more` : body;
}

export function buildAuditUpdateEvent(input: {
  action: string;
  entityType: string;
  entityId: string;
  storeId?: string | null;
  headline: string;
  syncNote?: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fieldLabels: Record<string, string>;
}): LogAuditEventInput {
  const changes = summarizeAuditChanges(input.before, input.after, input.fieldLabels);
  const changeSummary = formatAuditChangesList(changes);
  let description = input.headline;
  if (input.syncNote) description += ` ${input.syncNote}`;
  if (changeSummary) description += `: ${changeSummary}`;

  return {
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    storeId: input.storeId,
    description,
    metadata: {
      change_summary: changeSummary,
      changes,
    },
    oldData: input.before,
    newData: input.after,
  };
}
