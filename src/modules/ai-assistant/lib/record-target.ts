/** Heuristics to infer which ERP record the user means (for Open Record, not on-screen guide). */

export type RecordKind =
  | "customer"
  | "invoice"
  | "bill"
  | "vendor"
  | "product"
  | "estimate"
  | "sales-order"
  | "payment"
  | "employee";

export type RecordGuideTarget = {
  kind: RecordKind;
  kindLabel: string;
  listPath: string;
  query: string;
  tokens: string[];
  displayName: string;
};

type ChatTurn = { role: string; content: string };

const KIND_META: Record<
  RecordKind,
  { listPath: string; label: string; re: RegExp }
> = {
  customer: {
    listPath: "/admin/customers",
    label: "customer",
    re: /\b(customers?|client|buyer)\b/i,
  },
  invoice: {
    listPath: "/admin/erp/invoices",
    label: "invoice",
    re: /\b(invoices?|tax\s+invoice)\b/i,
  },
  bill: {
    listPath: "/admin/erp/purchase-bills",
    label: "purchase bill",
    re: /\b(purchase\s+bills?|vendor\s+bills?)\b/i,
  },
  vendor: {
    listPath: "/admin/vendors",
    label: "vendor",
    re: /\b(vendors?|suppliers?)\b/i,
  },
  product: {
    listPath: "/admin/products",
    label: "product",
    re: /\b(products?|items?|sku)\b/i,
  },
  estimate: {
    listPath: "/admin/erp/estimates",
    label: "estimate",
    re: /\b(estimates?|quotes?)\b/i,
  },
  "sales-order": {
    listPath: "/admin/erp/sales-orders",
    label: "sales order",
    re: /\b(sales\s+orders?)\b/i,
  },
  payment: {
    listPath: "/admin/erp/payments",
    label: "payment",
    re: /\b(payments?\s+received|customer\s+payments?)\b/i,
  },
  employee: {
    listPath: "/admin/erp/employees",
    label: "employee",
    re: /\b(employees?|staff)\b/i,
  },
};

const RECORD_ASK_RE =
  /\b(his|her|their)\s+(page|profile|record|account)\b|\bthis\s+(customer|invoice|bill|vendor|product|order|estimate|payment|employee)\b|\bopen (this|that|the)\s+(customer|invoice|bill|vendor)\b|\bopen\b.+\b(customer|invoice|bill|vendor|product|order)\b/i;

const STOP = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "his",
  "her",
  "their",
  "page",
  "profile",
  "record",
  "account",
  "open",
  "show",
  "view",
  "find",
  "take",
  "me",
  "to",
  "go",
  "guide",
  "please",
  "customer",
  "customers",
  "invoice",
  "invoices",
  "bill",
  "bills",
  "vendor",
  "vendors",
  "product",
  "products",
  "user",
  "phone",
  "email",
  "company",
  "named",
  "called",
  "search",
  "list",
  "admin",
  "system",
  "recorded",
  "address",
  "no",
  "has",
  "and",
  "for",
  "with",
  "something",
  "like",
  "maybe",
  "similar",
  "approx",
  "about",
]);

function stripMarkup(raw: string): string {
  return raw
    .replace(/\[REPORT\][\s\S]*?\[\/REPORT\]/gi, " ")
    .replace(/\[UI\][\s\S]*?\[\/UI\]/gi, " ")
    .replace(/\[OPEN\][\s\S]*?\[\/OPEN\]/gi, " ")
    .replace(/\[POINT:[^\]]+\]/gi, " ")
    .replace(/\[SUGGEST:[^\]]+\]/gi, " ")
    .replace(/\*\*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function blobFrom(goal: string, history: ChatTurn[]): string {
  const recent = history
    .slice(-8)
    .map((t) => stripMarkup(t.content))
    .join("\n");
  return `${recent}\n${stripMarkup(goal)}`;
}

function extractTokens(text: string): string[] {
  const found: string[] = [];
  const push = (v: string) => {
    const t = v.replace(/\s+/g, " ").trim();
    if (t.length < 2 || t.length > 48) return;
    if (STOP.has(t.toLowerCase())) return;
    if (!found.some((x) => x.toLowerCase() === t.toLowerCase())) found.push(t);
  };

  for (const m of text.matchAll(/\b(?:INV|EST|SO|PO|PB|BILL|CUS|CN|VN|EMP)[-A-Z0-9]{2,}\b/gi)) {
    push(m[0]);
  }
  for (const m of text.matchAll(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi)) {
    push(m[0]);
  }
  for (const m of text.matchAll(/\b(?:\+?\d[\d\s-]{7,16}\d)\b/g)) {
    push(m[0].replace(/[^\d+]/g, ""));
  }
  for (const m of text.matchAll(
    /\b(?:customer|company|vendor|invoice|bill|product)\s+(?:called\s+)?([A-Za-z][A-Za-z0-9._-]{1,40})\b/gi,
  )) {
    push(m[1]);
  }
  for (const m of text.matchAll(
    /\bcalled\s+(?:something\s+)?like\s+([A-Za-z][A-Za-z0-9._-]{1,40})\b/gi,
  )) {
    push(m[1]);
  }
  for (const m of text.matchAll(/\blike\s+([A-Za-z][A-Za-z0-9._-]{1,40})\b/gi)) {
    push(m[1]);
  }
  for (const m of text.matchAll(/\bcalled\s+([A-Za-z][A-Za-z0-9._-]{1,40})\b/gi)) {
    push(m[1]);
  }
  for (const m of text.matchAll(/\bnamed\s+([A-Za-z][A-Za-z0-9._-]{1,40})\b/gi)) {
    push(m[1]);
  }
  for (const m of text.matchAll(/\b([A-Z]{2,24})\b/g)) {
    if (!/^(ERP|POS|VAT|SKU|GRN|AR|AP|HR|UI|OK)$/i.test(m[1])) push(m[1]);
  }

  return found;
}

function inferKind(text: string): RecordKind {
  const order: RecordKind[] = [
    "invoice",
    "estimate",
    "sales-order",
    "bill",
    "payment",
    "vendor",
    "product",
    "employee",
    "customer",
  ];
  for (const kind of order) {
    if (KIND_META[kind].re.test(text)) return kind;
  }
  if (/\bINV[-A-Z0-9]/i.test(text)) return "invoice";
  if (/\b(PB|BILL)[-A-Z0-9]/i.test(text)) return "bill";
  if (/\bCUS[-A-Z0-9]/i.test(text)) return "customer";
  return "customer";
}

export function inferRecordGuideTarget(
  goal: string,
  history: ChatTurn[] = [],
): RecordGuideTarget | null {
  const g = stripMarkup(goal);
  const blob = blobFrom(g, history);
  const goalTokens = extractTokens(g);
  const tokens = goalTokens.length > 0 ? goalTokens : extractTokens(blob);
  if (tokens.length === 0) return null;

  if (goalTokens.length === 0 && !RECORD_ASK_RE.test(g) && !RECORD_ASK_RE.test(blob)) {
    return null;
  }

  const kind = inferKind(goalTokens.length > 0 ? g : `${g}\n${blob}`);
  const meta = KIND_META[kind];
  const nameTokens = tokens.filter(
    (t) => /[A-Za-z]/.test(t) && !/^\+?\d+$/.test(t),
  );
  const query = nameTokens[nameTokens.length - 1] ?? tokens[tokens.length - 1];
  const displayName = nameTokens[nameTokens.length - 1] ?? query;

  return {
    kind,
    kindLabel: meta.label,
    listPath: meta.listPath,
    query,
    tokens,
    displayName,
  };
}
