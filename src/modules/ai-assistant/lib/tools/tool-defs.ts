export type AssistantToolDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const PERIOD_ENUM = [
  "today",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "this_year",
  "custom",
];

export const ASSISTANT_TOOL_DEFS: AssistantToolDef[] = [
  {
    name: "lookup_sitemap",
    description:
      "Find admin screens, routes, and on-screen guide steps. Use for how-to, where-is, and Guide on Screen.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "User task or page name" },
        limit: { type: "integer", description: "Max pages, default 6" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_builtin_reports",
    description:
      "Returns slug, title, and description for each built-in ERP report. Use before run_builtin_report when the slug is unknown.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "run_builtin_report",
    description:
      "Executes a built-in ERP report and returns rows for the requested period. Use for charts/trends (e.g. daily-collection-report) and standard analytics instead of raw SQL.",
    parameters: {
      type: "object",
      properties: {
        slug: {
          type: "string",
          description: "Report slug, e.g. sales-by-salesman",
        },
        period: { type: "string", enum: PERIOD_ENUM },
        date_from: { type: "string", description: "YYYY-MM-DD" },
        date_to: { type: "string", description: "YYYY-MM-DD" },
        search: { type: "string" },
        channel: { type: "string", enum: ["all", "erp", "online"] },
      },
      required: ["slug"],
    },
  },
  {
    name: "lookup_business_data",
    description:
      "Live operational lookups. Use customer_balance for a named customer's receivable/balance due; open_payables is for vendor purchase bills only (not customers).",
    parameters: {
      type: "object",
      properties: {
        intent: {
          type: "string",
          enum: [
            "sales_ranking",
            "customer_purchase",
            "document_audit",
            "invoice_lookup",
            "product_search",
            "customer_search",
            "customer_balance",
            "open_payables",
          ],
        },
        customer: { type: "string", description: "Customer name fragment" },
        product: { type: "string", description: "Product / item name fragment" },
        document: {
          type: "string",
          description: "Invoice or bill number, or 'the bill' context",
        },
        period: { type: "string", enum: PERIOD_ENUM },
        date_from: { type: "string" },
        date_to: { type: "string" },
        query: { type: "string", description: "Raw user question for extra matching" },
      },
      required: ["intent"],
    },
  },
  {
    name: "describe_data_views",
    description: "Show allowlisted read-only SQL views and columns for custom reports.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "run_readonly_query",
    description:
      "Run one SELECT against ai_v_* views only (custom reports). Always LIMIT <= 50. Prefer lookup_business_data or run_builtin_report first.",
    parameters: {
      type: "object",
      properties: {
        sql: { type: "string" },
        purpose: { type: "string" },
      },
      required: ["sql"],
    },
  },
];

export function toOpenAiTools() {
  return ASSISTANT_TOOL_DEFS.map((fn) => ({
    type: "function" as const,
    function: {
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    },
  }));
}

export function toGeminiTools() {
  return [
    {
      functionDeclarations: ASSISTANT_TOOL_DEFS.map((fn) => ({
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      })),
    },
  ];
}
