import type { ComponentType } from "react";
import {
  ArrowRightLeft,
  Bell,
  BookOpen,
  Building2,
  Calculator,
  ClipboardList,
  CreditCard,
  FileText,
  FolderTree,
  KeyRound,
  Landmark,
  Layers,
  LayoutDashboard,
  ListOrdered,
  Package,
  Receipt,
  RotateCcw,
  Settings,
  ShoppingBasket,
  ShoppingCart,
  Tag,
  TrendingUp,
  Truck,
  UserCircle,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

export type AdminNavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  badge?: "NEW" | "Coming soon";
  keywords?: string[];
};

export type AdminNavSection = {
  label: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  items: AdminNavItem[];
};

export const ADMIN_DASHBOARD_ITEM: AdminNavItem = {
  name: "Dashboard",
  href: "/admin",
  icon: LayoutDashboard,
  keywords: ["home", "overview", "analytics"],
};

/**
 * Sidebar sections top → bottom follow daily operations:
 * catalog → stock → sell → buy → cash → books → insight → compliance → people → assets.
 */
export const ADMIN_NAV_SECTIONS: AdminNavSection[] = [
  // ─── Catalog & product masters ───────────────────────────────────────────
  {
    label: "Items",
    icon: Package,
    items: [
      { name: "Products", href: "/admin/products", icon: Package, keywords: ["catalog", "items", "sku", "products"] },
      { name: "Categories", href: "/admin/categories", icon: FolderTree, keywords: ["taxonomy", "category"] },
      { name: "Brands", href: "/admin/brands", icon: Tag, keywords: ["brand", "manufacturer"] },
      { name: "Item Units", href: "/admin/item-units", icon: Layers, keywords: ["uom", "unit"] },
    ],
  },

  // ─── Stock: view → adjust → inter-store → setup ──────────────────────────
  {
    label: "Inventory",
    icon: Warehouse,
    items: [
      { name: "Online Inventory", href: "/admin/inventory", icon: Warehouse, keywords: ["stock", "online", "transfers", "variants", "buyhub"] },
      { name: "Store inventory", href: "/admin/erp/store-inventory", icon: ClipboardList, keywords: ["physical stock", "store stock", "erp", "store inventory", "wac"] },
      { name: "Stock Adjustments", href: "/admin/erp/stock-adjustments", icon: Layers, keywords: ["adjustment", "correction"] },
      { name: "Item Transactions", href: "/admin/erp/item-transactions", icon: ListOrdered, keywords: ["stock movements", "audit", "history"] },
      { name: "Store Transfers", href: "/admin/erp/store-transfers", icon: ArrowRightLeft, keywords: ["inter-store", "stock transfer", "dispatch"] },
      { name: "Transfer Requests", href: "/admin/erp/transfer-requests", icon: Truck, keywords: ["transfer request", "requisition"] },
      { name: "Transfer Approvals", href: "/admin/erp/transfer-approvals", icon: ClipboardList, keywords: ["transfer approval", "pending"] },
      { name: "Transfer Statement", href: "/admin/erp/transfer-statement", icon: FileText, keywords: ["transfer statement", "history"] },
      { name: "Transfer Bulk Payments", href: "/admin/erp/transfer-bulk-payments", icon: Receipt, keywords: ["transfer payment", "bulk"] },
      { name: "Stores", href: "/admin/erp/stores", icon: Building2, keywords: ["branch", "store", "location"] },
    ],
  },

  // ─── Sales: masters → channels → documents → payments ────────────────────
  {
    label: "Sales",
    icon: ShoppingCart,
    items: [
      { name: "Customers", href: "/admin/customers", icon: UserCircle, keywords: ["buyers", "accounts", "customer"] },
      { name: "Online Orders", href: "/admin/orders", icon: ShoppingCart, keywords: ["online", "buyhub", "ecommerce", "app orders"] },
      { name: "Fulfillment Queue", href: "/admin/erp/fulfillment-queue", icon: Truck, keywords: ["fulfillment", "assign store", "ship", "pending assignment"] },
      { name: "POS Billing", href: "/admin/billing", icon: CreditCard, keywords: ["pos", "counter", "billing", "retail", "checkout"] },
      { name: "Estimates", href: "/admin/erp/estimates", icon: FileText, keywords: ["quote", "proposal", "estimate"] },
      { name: "Sales Orders", href: "/admin/erp/sales-orders", icon: ClipboardList, keywords: ["so", "sales order", "fulfillment commitment"] },
      { name: "Invoices", href: "/admin/erp/invoices", icon: FileText, keywords: ["billing", "tax invoice"] },
      { name: "Credit Notes", href: "/admin/erp/credit-notes", icon: RotateCcw, keywords: ["cn", "credit", "return"] },
      { name: "Payments Received", href: "/admin/erp/payments", icon: Receipt, keywords: ["payment received", "ar", "collection"] },
      { name: "Bulk Payments (Customers)", href: "/admin/erp/customer-bulk-payments", icon: Receipt, keywords: ["bulk payment", "customer payment"] },
      { name: "Recurring Invoices", href: "/admin/erp/recurring-invoices", icon: RotateCcw, keywords: ["recurring", "subscription", "repeat", "retainer"] },
    ],
  },

  // ─── Purchases: masters → documents → payments ───────────────────────────
  {
    label: "Purchases",
    icon: ShoppingBasket,
    items: [
      { name: "Vendors", href: "/admin/vendors", icon: Building2, keywords: ["suppliers", "vendor"] },
      { name: "Purchase Orders", href: "/admin/purchase-orders", icon: ClipboardList, keywords: ["po", "vendor orders"] },
      { name: "Purchase Bills", href: "/admin/erp/purchase-bills", icon: FileText, keywords: ["purchase entry", "vendor bill", "grn"] },
      { name: "Vendor Credits", href: "/admin/erp/vendor-credits", icon: RotateCcw, keywords: ["supplier credit", "debit note"] },
      { name: "Expenses", href: "/admin/erp/expenses", icon: Receipt, keywords: ["expense", "petty cash"] },
      { name: "Recurring Bills", href: "/admin/erp/recurring-bills", icon: RotateCcw, keywords: ["recurring", "subscription", "repeat"] },
      { name: "Landed Cost Items", href: "/admin/erp/landed-costs", icon: Layers, keywords: ["landed cost", "freight", "duty"] },
      { name: "Payments Made", href: "/admin/erp/supplier-payments", icon: Receipt, keywords: ["payment made", "supplier payment", "ap"] },
      { name: "Bulk Payments (Vendors)", href: "/admin/erp/supplier-bulk-payments", icon: Receipt, keywords: ["bulk payment", "vendor payment"] },
    ],
  },

  // ─── Cash & banking ────────────────────────────────────────────────────────
  {
    label: "Banking",
    icon: Landmark,
    items: [
      { name: "Cash Accounts", href: "/admin/erp/banking", icon: Wallet, keywords: ["cash", "bank accounts", "treasury"] },
      { name: "Payment Statement", href: "/admin/erp/payment-statement", icon: FileText, keywords: ["statement", "payments", "cash book"] },
      { name: "Profit Withdrawal", href: "/admin/erp/profit-withdrawals", icon: Receipt, keywords: ["profit", "withdrawal", "drawing"] },
    ],
  },

  // ─── General ledger ────────────────────────────────────────────────────────
  {
    label: "Accounts",
    icon: BookOpen,
    items: [
      { name: "Account Types", href: "/admin/erp/account-types", icon: Layers, keywords: ["ledger category", "account type"] },
      { name: "Chart of Accounts", href: "/admin/erp/accounts", icon: Wallet, keywords: ["chart of accounts", "ledger", "gl"] },
      { name: "Journal Entries", href: "/admin/erp/journal-entries", icon: FileText, keywords: ["journal", "gl", "manual entry"] },
    ],
  },

  // ─── Reporting & analytics ───────────────────────────────────────────────
  {
    label: "Reports",
    icon: TrendingUp,
    items: [
      { name: "All Reports", href: "/admin/erp/reports", icon: FileText, keywords: ["reports", "p&l", "trial balance", "ledger"] },
      { name: "Financial Summary", href: "/admin/erp/financial-summary", icon: TrendingUp, keywords: ["dashboard", "kpi", "finance summary"] },
      { name: "Reconciliation", href: "/admin/erp/reconciliation", icon: ClipboardList, keywords: ["reconcile", "audit", "stock reconcile"] },
      { name: "Online Store Analytics", href: "/admin/finance", icon: ShoppingCart, keywords: ["online", "orders", "margin", "analytics"] },
    ],
  },

  // ─── Tax compliance ──────────────────────────────────────────────────────
  {
    label: "VAT",
    icon: Calculator,
    items: [
      { name: "VAT Returns", href: "/admin/erp/vat-returns", icon: Receipt, keywords: ["vat", "tax return"] },
      { name: "VAT Payments", href: "/admin/erp/vat-payments", icon: Receipt, keywords: ["vat payment", "tax payment"] },
    ],
  },

  // ─── Payroll ─────────────────────────────────────────────────────────────
  {
    label: "HR",
    icon: Users,
    items: [
      { name: "Employees", href: "/admin/erp/employees", icon: Users, keywords: ["staff", "employee", "hr"] },
      { name: "Pay Slips", href: "/admin/erp/pay-slips", icon: FileText, keywords: ["payslip", "salary slip"] },
      { name: "Salary Payments", href: "/admin/erp/salary-payments", icon: Receipt, keywords: ["salary", "payroll"] },
      { name: "Salary Bulk Payments", href: "/admin/erp/salary-bulk-payments", icon: Receipt, keywords: ["bulk salary", "payroll batch"] },
      { name: "Employee Opening Balances", href: "/admin/erp/employee-opening-balances", icon: Wallet, keywords: ["opening balance", "employee advance"] },
    ],
  },

  // ─── Fixed assets ────────────────────────────────────────────────────────
  {
    label: "Assets",
    icon: Building2,
    items: [
      { name: "Fixed Assets", href: "/admin/erp/fixed-assets", icon: Building2, keywords: ["asset", "equipment", "depreciation"] },
    ],
  },

  {
    label: "Business",
    icon: Settings,
    items: [
      {
        name: "Business settings",
        href: "/admin/business",
        icon: Settings,
        keywords: ["currency", "payments", "region", "gst", "store settings"],
      },
      {
        name: "Tax rates",
        href: "/admin/config/tax",
        icon: Calculator,
        keywords: ["gst", "tax rates", "vat"],
      },
      {
        name: "Push notifications",
        href: "/admin/config/push",
        icon: Bell,
        keywords: ["expo", "alerts", "campaign", "offers"],
      },
    ],
  },
];

/** Search / command palette only — not shown in the primary sidebar. */
export const ADMIN_EXTRA_NAV_ITEMS: AdminNavItem[] = [
  { name: "Team & Users", href: "/admin/users", icon: Users, keywords: ["staff", "admin", "delivery", "team"] },
  { name: "Account settings", href: "/admin/config", icon: KeyRound, keywords: ["account", "password", "profile", "session"] },
];

export function getAllAdminNavItems(): AdminNavItem[] {
  return [
    ADMIN_DASHBOARD_ITEM,
    ...ADMIN_NAV_SECTIONS.flatMap((section) => section.items),
    ...ADMIN_EXTRA_NAV_ITEMS,
  ];
}
