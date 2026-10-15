export type SitemapGuideStep = {
  n: number;
  lookFor: string;
  do: string;
};

export type SitemapGuide = {
  finishLine: string;
  sidebarSection: string;
  primaryControl: string;
  steps: SitemapGuideStep[];
  related: string[];
  sampleAsks: string[];
};

const G = (
  section: string,
  control: string,
  finish: string,
  extra: Partial<SitemapGuide> = {},
): SitemapGuide => ({
  finishLine: finish,
  sidebarSection: section,
  primaryControl: control,
  steps: extra.steps ?? [
    {
      n: 1,
      lookFor: section,
      do: `If the left sidebar ${section} group is collapsed, expand it.`,
    },
    {
      n: 2,
      lookFor: control,
      do: `Click ${control} in the sidebar.`,
    },
  ],
  related: extra.related ?? [],
  sampleAsks: extra.sampleAsks ?? [
    `Show me ${control}`,
    `Where is ${control}?`,
  ],
});

/** Per-route on-screen recipes. Missing routes get a generated default. */
export const PAGE_GUIDES: Record<string, SitemapGuide> = {
  "/admin": G(
    "Overview",
    "Dashboard",
    "The home dashboard KPIs are visible.",
    {
      steps: [
        {
          n: 1,
          lookFor: "Dashboard",
          do: "Click Dashboard at the top of the left sidebar.",
        },
      ],
      sampleAsks: ["Take me home", "Where is the dashboard?"],
    },
  ),
  "/admin/products": G(
    "Items",
    "Products",
    "The product catalog list is open. For 'add product', also open New item — then stop; do not fill the form unless asked.",
    {
      steps: [
        { n: 1, lookFor: "Items", do: "Expand Items in the left sidebar if needed." },
        { n: 2, lookFor: "Products", do: "Click Products." },
        {
          n: 3,
          lookFor: "New item",
          do: "Only if they asked to add/create: click New item on the products page (not header CREATE unless they asked for quick create).",
        },
      ],
      related: ["/admin/categories", "/admin/brands", "/admin/inventory"],
      sampleAsks: [
        "How do I add a product with variants?",
        "Show me the catalog",
      ],
    },
  ),
  "/admin/customers": G(
    "Sales",
    "Customers",
    "The customer list is open. If they asked for a named customer, this list is not done: point at the matching row, or the search box if the row is missing.",
    {
      related: ["/admin/erp/invoices", "/admin/erp/payments"],
      sampleAsks: [
        "Where are customers?",
        "How do I add a customer?",
        "Take me to this customer’s page",
      ],
    },
  ),
  "/admin/billing": G(
    "Sales",
    "POS Billing",
    "The POS billing counter is on screen.",
    {
      related: ["/admin/erp/invoices", "/admin/customers"],
      sampleAsks: ["Open POS billing", "How do I make a retail bill?"],
    },
  ),
  "/admin/erp/invoices": G(
    "Sales",
    "Invoices",
    "The invoices list is open. Do not open New unless they asked to create an invoice. For a specific invoice, open that row’s detail page (or hand off to search).",
    {
      related: [
        "/admin/erp/payments",
        "/admin/erp/credit-notes",
        "/admin/erp/reports",
      ],
      sampleAsks: [
        "Where are tax invoices?",
        "Who edited an invoice?",
        "Open invoices",
      ],
    },
  ),
  "/admin/erp/estimates": G("Sales", "Estimates", "The estimates list is open."),
  "/admin/erp/sales-orders": G(
    "Sales",
    "Sales Orders",
    "The sales orders list is open.",
  ),
  "/admin/erp/payments": G(
    "Sales",
    "Payments Received",
    "Customer payments (AR) is open.",
  ),
  "/admin/erp/purchase-bills": G(
    "Purchases",
    "Purchase Bills",
    "Purchase bills / GRN entry is open. For a specific bill, open that row’s detail page (or hand off to search).",
    {
      related: ["/admin/purchase-orders", "/admin/vendors"],
      sampleAsks: ["Open purchase bills", "Who edited a purchase bill?"],
    },
  ),
  "/admin/vendors": G("Purchases", "Vendors", "The vendor list is open."),
  "/admin/purchase-orders": G(
    "Purchases",
    "Purchase Orders",
    "Purchase orders are open.",
  ),
  "/admin/erp/store-inventory": G(
    "Inventory",
    "Store inventory",
    "Store on-hand stock is open.",
    {
      related: ["/admin/inventory", "/admin/erp/stock-adjustments"],
    },
  ),
  "/admin/inventory": G(
    "Inventory",
    "Online Inventory",
    "Online / BuyHub stock is open.",
  ),
  "/admin/erp/reports": G(
    "Reports",
    "All Reports",
    "The reports workspace is open so they can pick a built-in report.",
    {
      related: ["/admin/erp/financial-summary", "/admin/finance"],
      sampleAsks: [
        "Where are reports?",
        "Show me sales by salesman",
      ],
    },
  ),
  "/admin/erp/employees": G("HR", "Employees", "Employee records are open."),
  "/admin/users": G("Team", "Users", "Team users and roles is open."),
  "/admin/erp/vat-returns": G(
    "VAT",
    "VAT Returns",
    "The VAT return workspace is open.",
  ),
};

export function defaultPageGuide(
  path: string,
  name: string,
  section: string,
): SitemapGuide {
  return (
    PAGE_GUIDES[path] ??
    G(section, name, `The user is on ${name} (${path}).`)
  );
}
