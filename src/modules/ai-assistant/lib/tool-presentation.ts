import type { AssistantPresent, UiBlock, UiEntityKind } from "./parse-ui";
import { sanitizePresent, serializeUiPresent, stripUiBlock } from "./parse-ui";

type JsonRecord = Record<string, unknown>;

function asRows(data: unknown): JsonRecord[] {
  if (Array.isArray(data)) {
    return data.filter((r) => r && typeof r === "object") as JsonRecord[];
  }
  if (data && typeof data === "object") {
    const rec = data as JsonRecord;
    for (const key of ["rows", "bills", "invoices", "customers", "products", "matches", "edits"]) {
      if (Array.isArray(rec[key])) return asRows(rec[key]);
    }
  }
  return [];
}

function fmtNum(n: number): string {
  return Number.isInteger(n)
    ? n.toLocaleString()
    : n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function field(label: string, value: unknown) {
  const v = value == null || value === "" ? null : String(value).trim();
  return v ? { label, value: v } : null;
}

function entityCard(
  kind: UiEntityKind,
  title: string,
  subtitle: string | undefined,
  href: string | undefined,
  fields: Array<{ label: string; value: string } | null>,
): UiBlock {
  return {
    type: "entity",
    kind,
    title,
    subtitle,
    href,
    fields: fields.filter(Boolean) as Array<{ label: string; value: string }>,
  };
}

function tableFromObjects(
  title: string,
  subtitle: string | undefined,
  rows: JsonRecord[],
  columns: Array<{ key: string; label: string; format?: "number" | undefined }>,
  cta?: { label: string; path: string },
): UiBlock | null {
  if (rows.length === 0) return null;
  const tableRows = rows.slice(0, 8).map((row) =>
    columns.map((col) => {
      const raw = row[col.key];
      if (raw == null) return null;
      if (col.format === "number") {
        const n = Number(raw);
        return Number.isFinite(n) ? n : String(raw);
      }
      return String(raw);
    }),
  );
  return {
    type: "table",
    title,
    subtitle,
    columns: columns.map((c) => c.label),
    rows: tableRows,
    ctaLabel: cta?.label,
    ctaPath: cta?.path,
  };
}

function lineChart(
  title: string,
  rows: JsonRecord[],
  labelKey: string,
  valueKey: string,
  currency = false,
): UiBlock | null {
  const items = rows
    .map((row) => {
      const label = String(row[labelKey] ?? "").trim();
      const value = Number(row[valueKey] ?? 0);
      if (!label || !Number.isFinite(value)) return null;
      return { label: label.slice(0, 40), value };
    })
    .filter(Boolean)
    .slice(0, 8) as Array<{ label: string; value: number }>;
  if (items.length === 0) return null;
  return {
    type: "chart",
    title,
    variant: "line",
    valueFormat: currency ? "currency" : "number",
    items,
  };
}

function presentOpenPayables(payload: JsonRecord): UiBlock[] {
  const bills = asRows(payload.bills ?? payload);
  const total = Number(payload.total_balance_due ?? 0);
  const count = Number(payload.count ?? bills.length);
  const blocks: UiBlock[] = [
    {
      type: "metrics",
      title: "Open payables",
      items: [
        { label: "Bills", value: fmtNum(count) },
        { label: "Total due", value: fmtNum(total) },
      ],
    },
  ];
  const chart = lineChart(
    "Balance due trend",
    bills,
    "purchase_bill_number",
    "balance_due",
    true,
  );
  if (chart) blocks.push(chart);
  const table = tableFromObjects(
    "Purchase bills",
    "By balance due",
    bills,
    [
      { key: "purchase_bill_number", label: "Bill" },
      { key: "vendor_name", label: "Vendor" },
      { key: "balance_due", label: "Due", format: "number" },
    ],
    { label: "Open purchase bills", path: "/admin/erp/purchase-bills" },
  );
  if (table) blocks.push(table);
  return blocks;
}

function presentSalesRanking(payload: JsonRecord): UiBlock[] {
  const rows = asRows(payload.rows ?? payload);
  const winner = payload.winner as JsonRecord | null;
  const blocks: UiBlock[] = [];
  if (winner) {
    blocks.push({
      type: "metrics",
      title: "Sales ranking",
      items: [
        {
          label: "Leader",
          value: String(winner.sales_person_name ?? winner.name ?? "—"),
        },
        {
          label: "Sales",
          value: fmtNum(Number(winner.total_sales ?? 0)),
        },
      ],
    });
  }
  const chart = lineChart(
    "Sales trend",
    rows,
    "sales_person_name",
    "total_sales",
    true,
  );
  if (chart) blocks.push(chart);
  const table = tableFromObjects(
    "Sales by salesman",
    undefined,
    rows,
    [
      { key: "sales_person_name", label: "Name" },
      { key: "invoice_count", label: "Invoices", format: "number" },
      { key: "total_sales", label: "Sales", format: "number" },
    ],
    { label: "Open reports", path: "/admin/reports" },
  );
  if (table) blocks.push(table);
  return blocks;
}

function presentCustomerBalance(payload: JsonRecord): UiBlock[] {
  const bal = payload.customer_balance as JsonRecord | undefined;
  const customers = asRows(payload.customers);
  const c = customers[0];
  if (!bal || !c) return presentCustomers(payload);

  const blocks: UiBlock[] = [
    {
      type: "metrics",
      title: "Receivables",
      items: [
        {
          label: "Balance due",
          value: fmtNum(Number(bal.balance_due ?? 0)),
        },
        {
          label: "Opening balance",
          value: fmtNum(Number(bal.opening_balance ?? 0)),
        },
        {
          label: "Invoices",
          value: String(bal.invoice_count ?? 0),
        },
      ],
    },
    entityCard(
      "customer",
      String(c.name ?? bal.name ?? "Customer"),
      "Customer",
      typeof c.adminHref === "string" ? c.adminHref : `/admin/customers/${c.id}`,
      [
        field("Email", c.email),
        field("Phone", c.phone),
        field("Paid to date", bal.payment_received != null ? fmtNum(Number(bal.payment_received)) : null),
        field("Unallocated payments", bal.unallocated_payments != null ? fmtNum(Number(bal.unallocated_payments)) : null),
      ],
    ),
  ];
  return blocks;
}

function presentCustomers(payload: JsonRecord): UiBlock[] {
  const customers = asRows(payload.customers);
  return customers.slice(0, 2).map((c) =>
    entityCard(
      "customer",
      String(c.name ?? "Customer"),
      c.role ? String(c.role) : undefined,
      typeof c.adminHref === "string" ? c.adminHref : `/admin/customers/${c.id}`,
      [
        field("Email", c.email),
        field("Phone", c.phone),
        field("Customer #", c.customer_number),
      ],
    ),
  );
}

function presentInvoices(payload: JsonRecord): UiBlock[] {
  const invoices = asRows(payload.invoices);
  const blocks: UiBlock[] = invoices.slice(0, 2).map((inv) =>
    entityCard(
      "invoice",
      String(inv.invoice_number ?? "Invoice"),
      inv.status ? String(inv.status) : undefined,
      typeof inv.adminHref === "string"
        ? inv.adminHref
        : `/admin/erp/invoices/${inv.id}`,
      [
        field("Issued", inv.issued_at ?? inv.created_at),
        field("Total", inv.total_amount != null ? fmtNum(Number(inv.total_amount)) : null),
        field("Balance", inv.balance_due != null ? fmtNum(Number(inv.balance_due)) : null),
        field("Paid", inv.amount_paid != null ? fmtNum(Number(inv.amount_paid)) : null),
      ],
    ),
  );
  if (invoices.length > 2) {
    const table = tableFromObjects(
      "Matching invoices",
      undefined,
      invoices,
      [
        { key: "invoice_number", label: "Invoice" },
        { key: "status", label: "Status" },
        { key: "balance_due", label: "Balance", format: "number" },
      ],
      { label: "All invoices", path: "/admin/erp/invoices" },
    );
    if (table) blocks.push(table);
  }
  return blocks;
}

function presentCustomerPurchase(payload: JsonRecord): UiBlock[] {
  const blocks: UiBlock[] = [];
  const customers = asRows(payload.customers);
  if (customers[0]) {
    const c = customers[0];
    blocks.push(
      entityCard(
        "customer",
        String(c.name ?? "Customer"),
        undefined,
        `/admin/customers/${c.id}`,
        [field("Phone", c.phone)],
      ),
    );
  }
  const matches = asRows(payload.matches);
  const table = tableFromObjects(
    "Line items",
    undefined,
    matches,
    [
      { key: "product_name", label: "Product" },
      { key: "quantity", label: "Qty", format: "number" },
      { key: "invoice_number", label: "Invoice" },
      { key: "line_total", label: "Amount", format: "number" },
    ],
    { label: "Invoices", path: "/admin/erp/invoices" },
  );
  if (table) blocks.push(table);
  return blocks;
}

function presentDocumentAudit(payload: JsonRecord): UiBlock[] {
  const edits = asRows(payload.edits);
  return [
    tableFromObjects(
      "Recent activity",
      undefined,
      edits,
      [
        { key: "when", label: "When" },
        { key: "actor_name", label: "User" },
        { key: "action", label: "Action" },
        { key: "description", label: "Detail" },
      ],
    )!,
  ].filter(Boolean);
}

const DATE_LABEL_KEYS = [
  "report_date",
  "date",
  "day",
  "period_from",
  "month_label",
];
const CHART_VALUE_KEYS = [
  "net_total",
  "total_payment",
  "total_sales",
  "total_amount",
  "amount",
  "balance_due",
  "invoice_count",
];

function formatChartLabel(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(5, 10);
  return s.length > 12 ? `${s.slice(0, 11)}…` : s;
}

function timeSeriesChartFromRows(
  title: string,
  rows: JsonRecord[],
  currency = true,
): UiBlock | null {
  if (rows.length === 0) return null;
  const sample = rows[0];
  const labelKey = DATE_LABEL_KEYS.find((k) => k in sample);
  const valueKey = CHART_VALUE_KEYS.find(
    (k) => k in sample && Number.isFinite(Number(sample[k])),
  );
  if (!labelKey || !valueKey) return null;

  const sorted = [...rows].sort((a, b) =>
    String(a[labelKey] ?? "").localeCompare(String(b[labelKey] ?? "")),
  );
  const items = sorted
    .map((row) => {
      const label = formatChartLabel(row[labelKey]);
      const value = Number(row[valueKey] ?? 0);
      if (!label || !Number.isFinite(value)) return null;
      return { label, value };
    })
    .filter(Boolean)
    .slice(0, 8) as Array<{ label: string; value: number }>;
  if (items.length === 0) return null;

  return {
    type: "chart",
    title,
    variant: "line",
    valueFormat: currency ? "currency" : "number",
    items,
  };
}

function presentBuiltinReport(payload: JsonRecord): UiBlock[] {
  const rows = asRows(payload.rows ?? payload);
  if (rows.length === 0) return [];
  const slug = String(payload.slug ?? "report");
  const period = payload.period as { label?: string } | undefined;
  const subtitle = period?.label ? String(period.label) : undefined;
  const blocks: UiBlock[] = [];

  const chart = timeSeriesChartFromRows(
    slug === "daily-collection-report"
      ? "Daily collections"
      : "Trend",
    rows,
    true,
  );
  if (chart) blocks.push(chart);

  const keys = Object.keys(rows[0])
    .filter((k) => !/^(id|_)/.test(k))
    .slice(0, 5);
  if (keys.length > 0) {
    const table = tableFromObjects(
      slug.replace(/-/g, " "),
      subtitle,
      rows,
      keys.map((k) => ({
        key: k,
        label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        format: typeof rows[0][k] === "number" ? "number" : undefined,
      })),
      { label: "Open reports", path: "/admin/reports" },
    );
    if (table) blocks.push(table);
  }
  return blocks;
}

function presentProducts(payload: JsonRecord): UiBlock[] {
  const products = asRows(payload.products);
  return products.slice(0, 2).map((p) =>
    entityCard(
      "product",
      String(p.name ?? "Product"),
      p.is_active === false ? "Inactive" : "Active",
      `/admin/products`,
      [
        field("Price", p.price != null ? fmtNum(Number(p.price)) : null),
        field("Barcode", p.barcode),
      ],
    ),
  );
}

function isPayablesPayload(rec: JsonRecord): boolean {
  return Array.isArray(rec.bills) && rec.total_balance_due != null;
}

function isCustomerBalancePayload(rec: JsonRecord): boolean {
  return rec.customer_balance != null && typeof rec.customer_balance === "object";
}

function isCustomerSearchPayload(rec: JsonRecord): boolean {
  return Array.isArray(rec.customers) && !rec.matches && !rec.customer_balance;
}

/** One primary tool outcome per reply — avoid stacking payables + customer UI. */
function pickPresentationSources(results: unknown[]): unknown[] {
  const valid = results.filter(
    (r) => r && typeof r === "object" && !(r as JsonRecord).error,
  ) as JsonRecord[];
  if (valid.length === 0) return [];

  for (let i = valid.length - 1; i >= 0; i -= 1) {
    const rec = valid[i];
    if (isCustomerBalancePayload(rec) || isCustomerSearchPayload(rec)) {
      return [rec];
    }
    if (isPayablesPayload(rec)) return [rec];
    if (rec.slug && Array.isArray(rec.rows)) return [rec];
    if (rec.winner != null) return [rec];
    if (Array.isArray(rec.invoices)) return [rec];
    if (Array.isArray(rec.matches) || (rec.customers && rec.matches)) {
      return [rec];
    }
    if (Array.isArray(rec.edits)) return [rec];
    if (Array.isArray(rec.products)) return [rec];
  }

  return [valid[valid.length - 1]];
}

function presentFromPayload(payload: unknown): UiBlock[] {
  if (!payload || typeof payload !== "object") return [];
  const rec = payload as JsonRecord;
  if (rec.error) return [];

  if (isCustomerBalancePayload(rec)) {
    return presentCustomerBalance(rec);
  }

  if (Array.isArray(rec.bills) && rec.total_balance_due != null) {
    return presentOpenPayables(rec);
  }
  if (rec.slug && Array.isArray(rec.rows)) {
    return presentBuiltinReport(rec);
  }
  if (Array.isArray(rec.rows) && rec.rowCount != null) {
    return presentBuiltinReport(rec);
  }
  if (
    rec.winner != null ||
    (Array.isArray(rec.rows) && rec.period && !rec.slug)
  ) {
    return presentSalesRanking(rec);
  }
  if (Array.isArray(rec.customers) && !rec.matches) {
    return presentCustomers(rec);
  }
  if (Array.isArray(rec.invoices)) {
    return presentInvoices(rec);
  }
  if (Array.isArray(rec.matches) || (rec.customers && rec.matches)) {
    return presentCustomerPurchase(rec);
  }
  if (Array.isArray(rec.edits)) {
    return presentDocumentAudit(rec);
  }
  if (Array.isArray(rec.products)) {
    return presentProducts(rec);
  }
  return [];
}

export function presentationFromToolResults(results: unknown[]): AssistantPresent | null {
  const blocks: UiBlock[] = [];
  for (const result of pickPresentationSources(results)) {
    for (const block of presentFromPayload(result)) {
      blocks.push(block);
      if (blocks.length >= 6) break;
    }
    if (blocks.length >= 6) break;
  }
  const present = sanitizePresent({ blocks });
  return present;
}

/** Append server-built UI when the model omitted [UI] (values come from tool JSON only). */
function insertPresentationTag(reply: string, tag: string): string {
  const suggestIdx = reply.search(/\[SUGGEST:/i);
  if (suggestIdx >= 0) {
    return `${reply.slice(0, suggestIdx).trimEnd()}\n${tag}\n${reply.slice(suggestIdx)}`;
  }
  const pointIdx = reply.search(/\[POINT:/i);
  if (pointIdx >= 0) {
    return `${reply.slice(0, pointIdx).trimEnd()}\n${tag}\n${reply.slice(pointIdx)}`;
  }
  return `${reply.trimEnd()}\n${tag}`;
}

export function ensurePresentationInReply(
  reply: string,
  toolResults: unknown[],
): string {
  const serverPresent = presentationFromToolResults(toolResults);
  const cleaned = stripUiBlock(reply);

  if (!serverPresent?.blocks.length) {
    return cleaned;
  }

  const tag = serializeUiPresent(serverPresent);
  return insertPresentationTag(cleaned, tag);
}
