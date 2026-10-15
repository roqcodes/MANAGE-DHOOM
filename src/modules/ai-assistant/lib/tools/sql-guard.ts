const MAX_SQL_CHARS = 2500;
const MAX_LIMIT = 50;

const BLOCKED =
  /\b(insert|update|delete|merge|upsert|drop|alter|create|truncate|grant|revoke|copy|vacuum|analyze|call|do\s|execute|prepare|deallocate|listen|notify|load|refresh|reindex|cluster|comment|security\s+definer|set\s+role|set\s+session|pg_sleep|pg_read|pg_ls|dblink|lo_|into\s+outfile|information_schema|pg_catalog|pg_auth|pg_proc|pg_roles|current_setting|set_config)\b/i;

const ALLOWED_VIEWS = new Set([
  "ai_v_invoices",
  "ai_v_invoice_lines",
  "ai_v_purchase_bills",
  "ai_v_purchase_bill_lines",
  "ai_v_customers",
  "ai_v_team",
  "ai_v_products",
  "ai_v_audit",
]);

export const AI_READONLY_VIEWS = [...ALLOWED_VIEWS];

export type SqlGuardOk = { ok: true; sql: string };
export type SqlGuardErr = { ok: false; error: string };

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'[^']*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, " ");
}

export function guardReadonlySelect(rawSql: string): SqlGuardOk | SqlGuardErr {
  const trimmed = rawSql.trim().replace(/;+\s*$/, "");
  if (!trimmed) return { ok: false, error: "Empty SQL." };
  if (trimmed.length > MAX_SQL_CHARS) {
    return { ok: false, error: "Query is too long." };
  }
  if (trimmed.includes(";")) {
    return { ok: false, error: "Only a single SELECT is allowed." };
  }

  const lowered = trimmed.toLowerCase();
  if (!/^(select|with)\b/.test(lowered)) {
    return { ok: false, error: "Only SELECT / WITH queries are allowed." };
  }

  const forScan = stripComments(trimmed);
  if (BLOCKED.test(forScan)) {
    return { ok: false, error: "Query uses a blocked keyword." };
  }
  if (/\b(for\s+update|for\s+share|into)\b/i.test(forScan)) {
    return { ok: false, error: "Query cannot lock or write rows." };
  }

  const refs = [
    ...forScan.matchAll(
      /\b(?:from|join)\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/gi,
    ),
  ].map((m) => m[1].toLowerCase());

  if (refs.length === 0) {
    return { ok: false, error: "Query must SELECT from an ai_v_* view." };
  }

  for (const name of refs) {
    if (!ALLOWED_VIEWS.has(name)) {
      return {
        ok: false,
        error: `View "${name}" is not allowlisted. Use ai_v_* views only.`,
      };
    }
  }

  let sql = trimmed;
  if (!/\blimit\s+\d+/i.test(sql)) {
    sql = `${sql} LIMIT ${MAX_LIMIT}`;
  } else {
    sql = sql.replace(/\blimit\s+(\d+)/i, (_m, n: string) => {
      const cap = Math.min(Math.max(Number(n) || MAX_LIMIT, 1), MAX_LIMIT);
      return `LIMIT ${cap}`;
    });
  }

  return { ok: true, sql };
}
