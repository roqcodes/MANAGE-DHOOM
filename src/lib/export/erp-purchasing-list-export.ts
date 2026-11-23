import type {
  ErpExpenseListRow,
  ErpPurchaseBillListRow,
  ErpSupplierPaymentListRow,
  ErpVendorCreditListRow,
  VendorErpListRow,
} from "@/common/erp/purchasing-types";
import { creditKindLabel } from "@/common/erp/commercial-discount";
import { formatCurrencyAmount } from "@/lib/format-currency";
import { formatDateOnly } from "@/lib/format-date";
import { formatErpDocRef } from "@/lib/erp-document-ref";

export function getPurchaseBillsExportTabular(rows: ErpPurchaseBillListRow[]) {
  const headers = [
    "Date",
    "Bill #",
    "Vendor bill #",
    "Store",
    "PO",
    "Vendor",
    "Status",
    "Landed",
    "Total",
    "Paid",
    "Balance",
  ];
  const body = rows.map((row) => [
    row.purchase_date ? formatDateOnly(row.purchase_date) : "",
    row.purchase_bill_number?.trim() || formatErpDocRef("PB", row.id),
    row.vendor_bill_number ?? "",
    row.store_name ?? "",
    row.po_number?.trim() || (row.po_id ? formatErpDocRef("PO", row.po_id) : ""),
    row.vendor_name ?? "",
    row.display_status ?? row.status ?? "",
    formatCurrencyAmount(row.landed_cost_total),
    formatCurrencyAmount(row.total_amount),
    formatCurrencyAmount(row.amount_paid),
    formatCurrencyAmount(row.balance_due),
  ]);
  return { headers, rows: body };
}

export function getExpensesExportTabular(rows: ErpExpenseListRow[]) {
  const headers = [
    "Date",
    "Expense #",
    "Store",
    "Account",
    "Vendor",
    "Customer",
    "Reference",
    "Total",
  ];
  const body = rows.map((row) => [
    row.expense_date ? formatDateOnly(row.expense_date) : "",
    row.expense_number?.trim() || formatErpDocRef("EXP", row.id),
    row.store_name ?? "",
    row.account_name ?? "",
    row.vendor_name ?? "",
    row.customer_name ?? "",
    row.reference ?? "",
    formatCurrencyAmount(row.total_amount),
  ]);
  return { headers, rows: body };
}

export function getSupplierPaymentsExportTabular(rows: ErpSupplierPaymentListRow[]) {
  const headers = [
    "Date",
    "Payment #",
    "Vendor",
    "Store",
    "Mode",
    "Bills",
    "Amount",
    "Unallocated",
    "Bulk",
  ];
  const body = rows.map((row) => [
    row.payment_date ? formatDateOnly(row.payment_date) : "",
    row.payment_number?.trim() || formatErpDocRef("PM", row.id),
    row.vendor_name ?? "",
    row.store_name ?? "",
    row.payment_mode ?? "",
    row.bill_numbers ?? "",
    formatCurrencyAmount(row.total_amount),
    formatCurrencyAmount(row.unallocated_amount),
    row.is_bulk ? "Yes" : "No",
  ]);
  return { headers, rows: body };
}

export function getVendorCreditsExportTabular(rows: ErpVendorCreditListRow[]) {
  const headers = [
    "Date",
    "Credit #",
    "Type",
    "Vendor",
    "Store",
    "Status",
    "Total",
    "Balance",
  ];
  const body = rows.map((row) => [
    row.credit_date ? formatDateOnly(row.credit_date) : "",
    row.credit_number?.trim() || formatErpDocRef("VC", row.id),
    creditKindLabel(row.credit_kind),
    row.vendor_name ?? "",
    row.store_name ?? "",
    row.status ?? "",
    formatCurrencyAmount(row.total_amount),
    formatCurrencyAmount(row.balance_remaining),
  ]);
  return { headers, rows: body };
}

export function getVendorsErpExportTabular(rows: VendorErpListRow[]) {
  const headers = ["Name", "Vendor type", "TRN", "Phone", "Email", "Active"];
  const body = rows.map((row) => [
    row.name ?? "",
    row.vendor_type ?? "",
    row.trn ?? "",
    row.phone ?? "",
    row.email ?? "",
    row.is_active === false ? "No" : "Yes",
  ]);
  return { headers, rows: body };
}