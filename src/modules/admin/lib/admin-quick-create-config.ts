import type { ComponentType } from "react";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Coins,
  FileText,
} from "lucide-react";

import {
  ADMIN_EXTRA_NAV_ITEMS,
  ADMIN_NAV_SECTIONS,
} from "@/modules/admin/lib/admin-nav-items";

export type BankingTxKind =
  | "owner_contribution"
  | "owner_drawing"
  | "generic"
  | "account_transfer";

type QuickCreateIcon = ComponentType<{ size?: number; className?: string }>;

const BANKING_TX_ICONS: Record<BankingTxKind, QuickCreateIcon> = {
  owner_contribution: ArrowDownLeft,
  owner_drawing: ArrowUpRight,
  generic: Coins,
  account_transfer: ArrowLeftRight,
};

export type QuickCreateLink = {
  type: "link";
  label: string;
  href: string;
  icon: QuickCreateIcon;
};

export type QuickCreateBankingTx = {
  type: "banking-tx";
  label: string;
  icon: QuickCreateIcon;
  txKind: BankingTxKind;
  direction?: "in" | "out";
};

export type QuickCreateEntry = QuickCreateLink | QuickCreateBankingTx;

export type QuickCreateGroup = {
  id: string;
  label: string;
  items: QuickCreateEntry[];
};

export type QuickCreateColumn = {
  groups: QuickCreateGroup[];
};

const CREATE_HREF_BY_LIST_PATH: Record<string, string> = {
  "/admin/products": "/admin/products?form=new",
  "/admin/customers": "/admin/customers?form=new",
  "/admin/erp/estimates": "/admin/erp/estimates?form=new",
  "/admin/erp/sales-orders": "/admin/erp/sales-orders?form=new",
  "/admin/erp/invoices": "/admin/erp/invoices?form=new",
  "/admin/erp/recurring-invoices": "/admin/erp/recurring-invoices?form=new",
  "/admin/erp/payments": "/admin/erp/payments?form=new",
  "/admin/erp/customer-bulk-payments": "/admin/erp/customer-bulk-payments?form=new",
  "/admin/erp/credit-notes": "/admin/erp/credit-notes?form=new",
  "/admin/erp/expenses": "/admin/erp/expenses?form=new",
  "/admin/purchase-orders": "/admin/purchase-orders?form=new",
  "/admin/erp/purchase-bills": "/admin/erp/purchase-bills?form=new",
  "/admin/erp/recurring-bills": "/admin/erp/recurring-bills?form=new&type=purchase_bill",
  "/admin/erp/supplier-payments": "/admin/erp/supplier-payments?form=new",
  "/admin/erp/supplier-bulk-payments": "/admin/erp/supplier-bulk-payments?form=new",
  "/admin/vendors": "/admin/vendors?form=new",
  "/admin/erp/vendor-credits": "/admin/erp/vendor-credits?form=new",
  "/admin/erp/transfer-requests": "/admin/erp/transfer-requests?form=new",
  "/admin/erp/store-transfers": "/admin/erp/store-transfers?form=new",
  "/admin/erp/transfer-bulk-payments": "/admin/erp/transfer-bulk-payments?form=new",
  "/admin/erp/stock-adjustments": "/admin/erp/stock-adjustments?form=new",
  "/admin/erp/stores": "/admin/erp/stores?form=new",
  "/admin/erp/fixed-assets": "/admin/erp/fixed-assets?form=new",
  "/admin/erp/profit-withdrawals": "/admin/erp/profit-withdrawals?form=new",
  "/admin/erp/vat-returns": "/admin/erp/vat-returns?form=new",
  "/admin/erp/vat-payments": "/admin/erp/vat-payments?form=new",
  "/admin/erp/journal-entries": "/admin/erp/journal-entries?form=new",
  "/admin/erp/employees": "/admin/erp/employees?form=new",
  "/admin/erp/salary-payments": "/admin/erp/salary-payments?form=new",
  "/admin/erp/salary-bulk-payments": "/admin/erp/salary-bulk-payments?form=new",
  "/admin/users": "/admin/users",
};

function findNavIcon(href: string): QuickCreateIcon {
  for (const section of ADMIN_NAV_SECTIONS) {
    const item = section.items.find((entry) => entry.href === href);
    if (item) return item.icon;
  }
  const extra = ADMIN_EXTRA_NAV_ITEMS.find((entry) => entry.href === href);
  return extra?.icon ?? FileText;
}

function findNavName(href: string): string | undefined {
  for (const section of ADMIN_NAV_SECTIONS) {
    const item = section.items.find((entry) => entry.href === href);
    if (item) return item.name;
  }
  return ADMIN_EXTRA_NAV_ITEMS.find((entry) => entry.href === href)?.name;
}

function link(listPath: string): QuickCreateLink | null {
  const href = CREATE_HREF_BY_LIST_PATH[listPath];
  const label = findNavName(listPath);
  if (!href || !label) return null;
  return { type: "link", label, href, icon: findNavIcon(listPath) };
}

function bankingTx(
  label: string,
  txKind: BankingTxKind,
  direction?: "in" | "out",
): QuickCreateBankingTx {
  return {
    type: "banking-tx",
    label,
    icon: BANKING_TX_ICONS[txKind],
    txKind,
    direction,
  };
}

function links(paths: string[]): QuickCreateLink[] {
  return paths.map(link).filter((entry): entry is QuickCreateLink => entry !== null);
}

function group(id: string, label: string, items: QuickCreateEntry[]): QuickCreateGroup | null {
  if (items.length === 0) return null;
  return { id, label, items };
}

/** All quick-create groups in display order (flows into 4 columns). */
export const ADMIN_QUICK_CREATE_GROUPS: QuickCreateGroup[] = [
  group("general", "General", links([
    "/admin/products",
    "/admin/users",
    "/admin/erp/journal-entries",
  ])),
  group("assets-vat", "Assets & VAT", links([
    "/admin/erp/fixed-assets",
    "/admin/erp/vat-returns",
    "/admin/erp/vat-payments",
  ])),
  group("money-in", "Money in", [
    bankingTx("Owner's contribution", "owner_contribution"),
    bankingTx("Other income", "generic", "in"),
  ]),
  group("money-out", "Money out", [
    bankingTx("Owner's drawings", "owner_drawing"),
    bankingTx("Transfer to account", "account_transfer"),
    ...links(["/admin/erp/profit-withdrawals"]),
  ]),
  group("sales", "Sales", links([
    "/admin/customers",
    "/admin/erp/estimates",
    "/admin/erp/sales-orders",
    "/admin/erp/invoices",
    "/admin/erp/recurring-invoices",
    "/admin/erp/payments",
    "/admin/erp/customer-bulk-payments",
    "/admin/erp/credit-notes",
  ])),
  group("purchases", "Purchases", links([
    "/admin/erp/expenses",
    "/admin/vendors",
    "/admin/purchase-orders",
    "/admin/erp/purchase-bills",
    "/admin/erp/recurring-bills",
    "/admin/erp/supplier-payments",
    "/admin/erp/supplier-bulk-payments",
    "/admin/erp/vendor-credits",
  ])),
  group("hr", "HR", links([
    "/admin/erp/employees",
    "/admin/erp/salary-payments",
    "/admin/erp/salary-bulk-payments",
  ])),
  group("inventory", "Inventory", links([
    "/admin/erp/stock-adjustments",
    "/admin/erp/transfer-requests",
    "/admin/erp/store-transfers",
    "/admin/erp/transfer-bulk-payments",
    "/admin/erp/stores",
  ])),
].filter((entry): entry is QuickCreateGroup => entry !== null);
