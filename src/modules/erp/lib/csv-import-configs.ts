export type CsvImportEntity =
  | "products"
  | "customers"
  | "vendors"
  | "expenses"
  | "purchase_bills"
  | "banking_transactions";

export type CsvImportConfig = {
  entity: CsvImportEntity;
  title: string;
  description: string;
  sampleHeaders: string[];
  sampleRow: Record<string, string>;
};

export const CSV_IMPORT_CONFIGS: Record<CsvImportEntity, CsvImportConfig> = {
  products: {
    entity: "products",
    title: "Import products",
    description: "Upload a CSV to create or update catalog items. SKU is used to match existing products.",
    sampleHeaders: ["name", "sku", "category", "brand", "base_price", "gst_rate", "description", "is_active"],
    sampleRow: {
      name: "Stainless Steel Pan 24cm",
      sku: "PAN-24-SS",
      category: "Cookware",
      brand: "KitchenGrid",
      base_price: "89.00",
      gst_rate: "5",
      description: "Heavy-duty pan",
      is_active: "true",
    },
  },
  customers: {
    entity: "customers",
    title: "Import customers",
    description: "Upload customer contacts. Email is required and used as the unique key.",
    sampleHeaders: ["name", "email", "phone", "company_name", "trn", "credit_limit"],
    sampleRow: {
      name: "Ahmed Hassan",
      email: "ahmed@example.com",
      phone: "+971501234567",
      company_name: "Hassan Trading LLC",
      trn: "100123456700003",
      credit_limit: "50000",
    },
  },
  vendors: {
    entity: "vendors",
    title: "Import vendors",
    description: "Upload supplier records. Email is used to match existing vendors.",
    sampleHeaders: ["name", "email", "phone", "company_name", "trn", "payment_terms"],
    sampleRow: {
      name: "Global Supplies FZE",
      email: "orders@globalsupplies.ae",
      phone: "+97143334444",
      company_name: "Global Supplies FZE",
      trn: "100987654300003",
      payment_terms: "Net 30",
    },
  },
  expenses: {
    entity: "expenses",
    title: "Import expenses",
    description: "Upload expense rows. Account code and paid-through account code must exist.",
    sampleHeaders: [
      "expense_date",
      "account_code",
      "amount",
      "tax_percent",
      "tax_mode",
      "paid_through_code",
      "reference",
      "notes",
      "vendor_email",
    ],
    sampleRow: {
      expense_date: "2026-08-30",
      account_code: "6100",
      amount: "250.00",
      tax_percent: "5",
      tax_mode: "exclusive",
      paid_through_code: "1000",
      reference: "FUEL-AUG",
      notes: "Delivery van fuel",
      vendor_email: "",
    },
  },
  purchase_bills: {
    entity: "purchase_bills",
    title: "Import purchase bills",
    description: "One row per bill line. Repeat bill_number for multiple lines on the same bill.",
    sampleHeaders: [
      "bill_number",
      "vendor_email",
      "bill_date",
      "due_date",
      "product_name",
      "quantity",
      "unit_price",
      "tax_rate",
      "reference",
    ],
    sampleRow: {
      bill_number: "PB-IMPORT-001",
      vendor_email: "orders@globalsupplies.ae",
      bill_date: "2026-08-30",
      due_date: "2026-09-29",
      product_name: "Packaging boxes",
      quantity: "100",
      unit_price: "2.50",
      tax_rate: "5",
      reference: "PO-4421",
    },
  },
  banking_transactions: {
    entity: "banking_transactions",
    title: "Import banking transactions",
    description: "Upload cash/bank movements. Account code must match an existing account.",
    sampleHeaders: ["transaction_date", "account_code", "type", "amount", "reference", "notes"],
    sampleRow: {
      transaction_date: "2026-08-30",
      account_code: "1000",
      type: "deposit",
      amount: "5000.00",
      reference: "CASH-DEP-001",
      notes: "Owner contribution",
    },
  },
};
