import "server-only";

import { ERP_REPORTS } from "@/common/erp/report-types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { runErpReport } from "@/modules/erp/services/erp-reports.service";

import { formatSitemapContextBlock, rankSitemapPages } from "../app-sitemap";
import { describeReadonlySchema } from "./schema-catalog";
import { resolvePeriod, type PeriodKey } from "./period";
import { guardReadonlySelect } from "./sql-guard";
import { searchCustomersTypeahead } from "@/modules/customers/lib/customer-typeahead-query";
import { getCustomerErpSummary } from "@/modules/customers/services/customer-erp.service";

const MAX_ROWS = 40;
const CANCELLED = "cancelled";

type JsonRecord = Record<string, unknown>;

function asRows(data: unknown): JsonRecord[] {
  if (Array.isArray(data)) {
    return data.filter((r) => r && typeof r === "object") as JsonRecord[];
  }
  if (data && typeof data === "object") {
    const rec = data as JsonRecord;
    for (const key of ["rows", "data", "items", "result"]) {
      if (Array.isArray(rec[key])) return asRows(rec[key]);
    }
    return [rec];
  }
  return [];
}

function clipRows(rows: JsonRecord[], limit = MAX_ROWS) {
  const sliced = rows.slice(0, limit);
  return {
    rowCount: rows.length,
    truncated: rows.length > limit,
    rows: sliced,
  };
}

function sanitizeIlike(q: string) {
  return q.replace(/[%_,()]/g, " ").trim().slice(0, 80);
}

function displayName(row: {
  name?: string | null;
  company_name?: string | null;
  contact_display_name?: string | null;
}) {
  return (
    row.company_name?.trim() ||
    row.contact_display_name?.trim() ||
    row.name?.trim() ||
    "Unknown"
  );
}

function parseArgs(raw: string): JsonRecord {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as JsonRecord) : {};
  } catch {
    return {};
  }
}

async function runReadonlySql(sql: string) {
  const guarded = guardReadonlySelect(sql);
  if (!guarded.ok) return { error: guarded.error };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await (
    supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>;
    }
  ).rpc("ai_assistant_run_select", { p_sql: guarded.sql });

  if (error) {
    return {
      error: error.message,
      hint: /could not find the function/i.test(error.message)
        ? "Apply migration 20261016010000_ai_assistant_readonly_views."
        : undefined,
    };
  }
  return data;
}

async function salesRanking(args: JsonRecord) {
  const range = resolvePeriod(
    args.period as PeriodKey,
    String(args.date_from ?? args.dateFrom ?? ""),
    String(args.date_to ?? args.dateTo ?? ""),
  );
  const data = await runErpReport(
    {
      slug: "sales-by-salesman",
      dateFrom: range.from,
      dateTo: range.to,
      channel: "all",
    },
    { authenticated: true },
  );
  const rows = asRows(data).sort(
    (a, b) => Number(b.total_sales ?? 0) - Number(a.total_sales ?? 0),
  );
  return {
    period: range,
    winner: rows[0] ?? null,
    ...clipRows(rows, 15),
  };
}

async function customerBalanceLookup(args: JsonRecord) {
  const q = sanitizeIlike(String(args.customer ?? args.query ?? ""));
  if (q.length < 2) {
    return { error: "Need a customer name or fragment." };
  }
  const rows = await searchCustomers(q);
  if (rows.length === 0) {
    return { customers: [], note: `No customer matching “${q}”.` };
  }
  const primary = rows[0];
  const summary = await getCustomerErpSummary(primary.id);
  const name = displayName(primary);
  return {
    intent: "customer_balance",
    customers: [
      {
        id: primary.id,
        name,
        phone: primary.phone,
        email: primary.email,
        customer_number: primary.customer_number,
        adminHref: `/admin/customers/${primary.id}`,
      },
    ],
    customer_balance: {
      user_id: primary.id,
      name,
      balance_due: summary.balanceDue,
      receivables: summary.receivables,
      opening_balance: summary.openingBalance,
      invoice_count: summary.invoiceCount,
      payment_received: summary.paymentReceived,
      unallocated_payments: summary.unallocatedPayments,
    },
  };
}

async function searchCustomers(fragment: string) {
  const supabase = await createSupabaseServerClient();
  const q = sanitizeIlike(fragment);
  if (q.length < 2) return [];
  const rows = await searchCustomersTypeahead(supabase, q, 12);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company_name: null,
    contact_display_name: null,
    phone: r.phone,
    email: r.email,
    customer_number: r.customer_number,
    role: "customer" as const,
  }));
}

async function customerPurchase(args: JsonRecord) {
  const customerQ = sanitizeIlike(String(args.customer ?? ""));
  const productQ = sanitizeIlike(String(args.product ?? ""));
  if (customerQ.length < 2 && productQ.length < 2) {
    return { error: "Need a customer and/or product name." };
  }

  const supabase = await createSupabaseServerClient();
  let customerIds: string[] | null = null;
  let customers: Awaited<ReturnType<typeof searchCustomers>> = [];
  if (customerQ.length >= 2) {
    customers = await searchCustomers(customerQ);
    customerIds = customers.map((c) => c.id);
    if (customerIds.length === 0) {
      return { customers: [], matches: [], note: `No customer matching “${customerQ}”.` };
    }
  }

  let invoiceIds: string[] | null = null;
  if (customerIds && customerIds.length > 0) {
    const { data: invRows, error: invErr } = await supabase
      .from("invoices")
      .select("id")
      .in("user_id", customerIds)
      .neq("status", CANCELLED)
      .limit(200);
    if (invErr) throw new Error(invErr.message);
    invoiceIds = (invRows ?? []).map((r) => r.id);
    if (invoiceIds.length === 0) {
      return {
        customers: customers.map((c) => ({
          id: c.id,
          name: displayName(c),
          phone: c.phone,
        })),
        matches: [],
        note: "Customer found, but no invoices in range.",
      };
    }
  }

  let query = supabase
    .from("invoice_items")
    .select(
      "id, product_name, quantity, unit_price, total_amount, invoices!inner(id, invoice_number, issued_at, created_at, status, total_amount, user_id, sales_person_id)",
    )
    .neq("invoices.status", CANCELLED)
    .limit(30);

  if (productQ.length >= 2) {
    query = query.ilike("product_name", `%${productQ}%`);
  }
  if (invoiceIds && invoiceIds.length > 0) {
    query = query.in("invoice_id", invoiceIds);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const matches = (data ?? []).map((row) => {
    const inv = row.invoices as unknown as {
      id: string;
      invoice_number: string;
      issued_at: string | null;
      created_at: string;
      status: string;
      total_amount: number;
      user_id: string;
    } | null;
    const cust = customers.find((c) => c.id === inv?.user_id);
    return {
      when: inv?.issued_at || inv?.created_at,
      invoice_number: inv?.invoice_number,
      invoice_status: inv?.status,
      customer: cust ? displayName(cust) : inv?.user_id,
      product_name: row.product_name,
      quantity: row.quantity,
      line_total: row.total_amount,
    };
  });

  return {
    customers: customers.map((c) => ({
      id: c.id,
      name: displayName(c),
      phone: c.phone,
    })),
    matches,
  };
}

async function documentAudit(args: JsonRecord) {
  const document = String(args.document ?? "").trim();
  const queryText = String(args.query ?? document).trim();
  const supabase = await createSupabaseServerClient();
  const needle = sanitizeIlike(document.replace(/^#/, ""));

  if (needle.length < 2) {
    const { data: logs, error } = await supabase
      .from("audit_logs")
      .select(
        "id, created_at, action, entity_type, entity_id, description, user_id, users:users!audit_logs_user_fkey(name, role)",
      )
      .in("entity_type", ["invoice", "purchase_bill", "erp_purchase_bill"])
      .in("action", ["update", "create_invoice", "cancel"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return {
      invoices: [],
      purchase_bills: [],
      edits: (logs ?? []).map((log) => {
        const actor = log.users as unknown as
          | { name: string | null; role: string | null }
          | { name: string | null; role: string | null }[]
          | null;
        const user = Array.isArray(actor) ? actor[0] : actor;
        return {
          when: log.created_at,
          action: log.action,
          entity_type: log.entity_type,
          entity_id: log.entity_id,
          description: log.description,
          actor_name: user?.name ?? "Unknown user",
          actor_role: user?.role ?? null,
        };
      }),
      note: queryText
        ? "No document number detected; showing recent invoice/bill edits."
        : undefined,
    };
  }

  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, status, created_at, issued_at, total_amount, user_id")
    .ilike("invoice_number", `%${needle}%`)
    .limit(8);

  const { data: bills } = await supabase
    .from("erp_purchase_bills")
    .select(
      "id, purchase_bill_number, vendor_bill_number, status, created_at, updated_at, total_amount, created_by",
    )
    .or(
      `purchase_bill_number.ilike.%${needle}%,vendor_bill_number.ilike.%${needle}%`,
    )
    .limit(8);

  const ids = [
    ...(invoices ?? []).map((i) => i.id),
    ...(bills ?? []).map((b) => b.id),
  ];

  let auditQuery = supabase
    .from("audit_logs")
    .select(
      "id, created_at, action, entity_type, entity_id, description, user_id, users:users!audit_logs_user_fkey(name, role)",
    )
    .order("created_at", { ascending: false })
    .limit(40);

  if (ids.length > 0) {
    auditQuery = auditQuery.in("entity_id", ids);
  } else {
    auditQuery = auditQuery.ilike("description", `%${needle}%`);
  }

  const { data: logs, error } = await auditQuery;
  if (error) throw new Error(error.message);

  return {
    invoices: invoices ?? [],
    purchase_bills: bills ?? [],
    edits: (logs ?? []).map((log) => {
      const actor = log.users as unknown as
        | { name: string | null; role: string | null }
        | { name: string | null; role: string | null }[]
        | null;
      const user = Array.isArray(actor) ? actor[0] : actor;
      return {
        when: log.created_at,
        action: log.action,
        entity_type: log.entity_type,
        entity_id: log.entity_id,
        description: log.description,
        actor_name: user?.name ?? "Unknown user",
        actor_role: user?.role ?? null,
      };
    }),
  };
}

async function invoiceLookup(args: JsonRecord) {
  const document = String(args.document ?? args.query ?? "").trim();
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("invoices")
    .select(
      "id, invoice_number, status, issued_at, created_at, total_amount, amount_paid, balance_due, user_id, sales_person_id",
    )
    .order("created_at", { ascending: false })
    .limit(12);
  if (document.length >= 2) {
    q = q.ilike("invoice_number", `%${document}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return {
    invoices: (data ?? []).map((row) => ({
      ...row,
      adminHref: `/admin/erp/invoices/${row.id}`,
    })),
  };
}

function vendorNameFromJoin(row: { vendors?: unknown }) {
  const v = row.vendors as
    | { name?: string | null }
    | { name?: string | null }[]
    | null
    | undefined;
  const one = Array.isArray(v) ? v[0] : v;
  return one?.name?.trim() || "Unknown vendor";
}

async function openPayables() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_purchase_bills")
    .select(
      "id, purchase_bill_number, vendor_bill_number, status, purchase_date, total_amount, amount_paid, balance_due, vendors(name)",
    )
    .gt("balance_due", 0)
    .neq("status", CANCELLED)
    .order("balance_due", { ascending: false })
    .limit(25);
  if (error) throw new Error(error.message);

  const bills = (data ?? []).map((row) => ({
    id: row.id,
    purchase_bill_number: row.purchase_bill_number,
    vendor_bill_number: row.vendor_bill_number,
    vendor_name: vendorNameFromJoin(row),
    status: row.status,
    purchase_date: row.purchase_date,
    total_amount: row.total_amount,
    amount_paid: row.amount_paid,
    balance_due: row.balance_due,
  }));
  const totalDue = bills.reduce((sum, b) => sum + Number(b.balance_due ?? 0), 0);
  return {
    count: bills.length,
    total_balance_due: totalDue,
    top: bills[0] ?? null,
    bills,
  };
}

async function productSearch(args: JsonRecord) {
  const product = String(args.product ?? args.query ?? "").trim();
  if (product.length < 2) return { error: "Need a product name." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, is_active, price, purchase_price, barcode")
    .ilike("name", `%${product}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  return { products: data ?? [] };
}

export async function executeAssistantTool(
  name: string,
  rawArgs: string,
): Promise<unknown> {
  const args = parseArgs(rawArgs);

  switch (name) {
    case "lookup_sitemap": {
      const query = String(args.query ?? "");
      const limit = Math.min(Number(args.limit) || 6, 10);
      const pages = rankSitemapPages(query, limit);
      return {
        pages,
        text: formatSitemapContextBlock(pages, { detailed: true }),
      };
    }
    case "list_builtin_reports":
      return ERP_REPORTS.map((r) => ({
        slug: r.slug,
        title: r.title,
        category: r.category,
        description: r.description,
      }));
    case "run_builtin_report": {
      const slug = String(args.slug ?? "");
      const range = resolvePeriod(
        args.period as PeriodKey,
        String(args.date_from ?? ""),
        String(args.date_to ?? ""),
      );
      const data = await runErpReport(
        {
          slug,
          dateFrom: range.from,
          dateTo: range.to,
          search: args.search ? String(args.search) : undefined,
          channel:
            args.channel === "erp" || args.channel === "online"
              ? args.channel
              : "all",
        },
        { authenticated: true },
      );
      return { slug, period: range, ...clipRows(asRows(data)) };
    }
    case "lookup_business_data": {
      const intent = String(args.intent ?? "");
      if (intent === "sales_ranking") return salesRanking(args);
      if (intent === "customer_purchase") return customerPurchase(args);
      if (intent === "document_audit") return documentAudit(args);
      if (intent === "invoice_lookup") return invoiceLookup(args);
      if (intent === "product_search") return productSearch(args);
      if (intent === "open_payables") return openPayables();
      if (intent === "customer_balance") return customerBalanceLookup(args);
      if (intent === "customer_search") {
        const rows = await searchCustomers(String(args.customer ?? args.query ?? ""));
        return {
          customers: rows.map((c) => ({
            id: c.id,
            name: displayName(c),
            phone: c.phone,
            email: c.email,
            role: c.role,
            adminHref: `/admin/customers/${c.id}`,
          })),
        };
      }
      return { error: `Unknown intent ${intent}` };
    }
    case "describe_data_views":
      return describeReadonlySchema();
    case "run_readonly_query":
      return runReadonlySql(String(args.sql ?? ""));
    default:
      return { error: `Unknown tool ${name}` };
  }
}
