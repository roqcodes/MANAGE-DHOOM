const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isOpaqueId(segment: string): boolean {
  return UUID_RE.test(segment) || /^\d+$/.test(segment);
}

function titleCase(words: string): string {
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

function humanizeSlug(slug: string): string {
  return titleCase(slug.replace(/-/g, " "));
}

const ERP_RESOURCE_LABELS: Record<string, string> = {
  "sales-catalog": "Searching products for sale",
  "purchase-catalog": "Searching purchase products",
  "sales-orders": "sales orders",
  invoices: "invoices",
  "purchase-bills": "purchase bills",
  "purchase-orders": "purchase orders",
  payments: "payments",
  "customer-bulk-payments": "customer payments",
  "supplier-payments": "supplier payments",
  customers: "customers",
  vendors: "vendors",
  products: "products",
  "stock-adjustments": "stock adjustments",
  "store-transfers": "store transfers",
  "transfer-requests": "transfer requests",
  accounts: "accounts",
  banking: "banking",
  "journal-entries": "journal entries",
  expenses: "expenses",
  employees: "employees",
  stores: "stores",
  context: "store context",
  reports: "reports",
  "finance-dashboard": "finance summary",
  "nav-badges": "menu counts",
  dashboard: "dashboard",
};

/** User-facing label for an in-flight `/api/admin/*` request. */
export function labelForAdminApiRequest(pathAndQuery: string, method = "GET"): string {
  const path = pathAndQuery.split("?")[0].replace(/^\//, "");
  const segments = path.split("/").filter(Boolean);
  const verb = method.toUpperCase();

  if (segments[0] === "erp" && segments[1]) {
    const mapped = ERP_RESOURCE_LABELS[segments[1]];
    if (mapped && segments[1].includes("catalog")) return mapped;
    const resource = mapped ?? humanizeSlug(segments[1]);
    const hasId = segments.some((s, i) => i >= 2 && isOpaqueId(s));
    if (verb === "GET") {
      return hasId ? `Loading ${resource}` : `Loading ${resource}`;
    }
    if (verb === "DELETE") return `Removing ${resource}`;
    if (verb === "POST") return `Saving ${resource}`;
    return `Updating ${resource}`;
  }

  if (segments[0] === "customers") {
    if (verb === "GET") {
      const q = pathAndQuery.includes("view=search");
      if (q) return "Searching customers";
      return segments.length > 1 ? "Loading customer profile" : "Loading customers";
    }
    return verb === "POST" ? "Creating customer" : "Updating customer";
  }

  if (segments[0] === "vendors") {
    if (verb === "GET" && pathAndQuery.includes("view=search")) return "Searching vendors";
    return segments.length > 1 ? "Loading vendor" : "Loading vendors";
  }

  if (segments[0] === "products") {
    if (verb === "GET") return segments.length > 1 ? "Loading product" : "Loading products";
    return verb === "POST" ? "Saving product" : "Updating product";
  }

  if (segments[0] === "orders") return "Loading orders";
  if (segments[0] === "inventory") return "Loading inventory";
  if (segments[0] === "dashboard") return "Loading dashboard";

  const named = segments.find((s) => !isOpaqueId(s));
  const entity = named ? humanizeSlug(named) : "data";
  if (verb === "GET") return `Loading ${entity}`;
  if (verb === "POST") return `Saving ${entity}`;
  if (verb === "DELETE") return `Deleting ${entity}`;
  return `Updating ${entity}`;
}
