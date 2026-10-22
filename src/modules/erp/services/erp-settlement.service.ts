import "server-only";

import type {
  AccountSettlementPreview,
  SettlementCreditApplicationPlan,
  SettlementCreditLine,
  SettlementDocumentLine,
  SettlementSide,
} from "@/common/erp/settlement-types";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { quantizePaymentAmount } from "@/lib/decimal-precision";
import { PAYMENT_BALANCE_TOLERANCE } from "@/modules/erp/lib/payment-balance-validation";
import { applyCreditNoteToInvoice } from "@/modules/erp/services/erp-credit-notes.service";
import { recordCustomerPayment } from "@/modules/erp/services/erp-payments.service";
import {
  listReceivableInvoicesForCustomer,
} from "@/modules/erp/services/erp-payments.service";
import { recordSupplierPayment } from "@/modules/erp/services/erp-supplier-payments.service";
import { listPayableBillsForVendor } from "@/modules/erp/services/erp-supplier-payments.service";
import { applyVendorCredit } from "@/modules/erp/services/erp-vendor-credits.service";
import { getCustomerErpSummary } from "@/modules/customers/services/customer-erp.service";
import { getVendorErpSummary } from "@/modules/vendors/services/vendor-erp.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";

export type {
  AccountSettlementPreview,
  SettlementSide,
} from "@/common/erp/settlement-types";

function planCreditApplications(
  documents: SettlementDocumentLine[],
  credits: SettlementCreditLine[],
): {
  plans: SettlementCreditApplicationPlan[];
  documentsAfter: SettlementDocumentLine[];
} {
  const docs = documents.map((d) => ({ ...d, balance: quantizePaymentAmount(d.balance) }));
  const plans: SettlementCreditApplicationPlan[] = [];

  for (const credit of credits) {
    let creditLeft = quantizePaymentAmount(credit.balanceRemaining);
    if (creditLeft <= PAYMENT_BALANCE_TOLERANCE) continue;

    for (const doc of docs) {
      if (creditLeft <= PAYMENT_BALANCE_TOLERANCE) break;
      if (doc.balance <= PAYMENT_BALANCE_TOLERANCE) continue;

      const amount = quantizePaymentAmount(Math.min(creditLeft, doc.balance));
      if (amount <= PAYMENT_BALANCE_TOLERANCE) continue;

      plans.push({
        creditId: credit.id,
        creditNumber: credit.number,
        documentId: doc.id,
        documentNumber: doc.number,
        amount,
      });
      doc.balance = quantizePaymentAmount(doc.balance - amount);
      creditLeft = quantizePaymentAmount(creditLeft - amount);
    }
  }

  return { plans, documentsAfter: docs };
}

async function listOpenVendorCredits(vendorId: string, storeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_vendor_credits")
    .select("id, credit_number, credit_date, balance_remaining, credit_kind")
    .eq("vendor_id", vendorId)
    .eq("store_id", storeId)
    .gt("balance_remaining", 0)
    .in("status", ["issued", "applied"])
    .order("credit_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.credit_number,
    date: row.credit_date,
    balanceRemaining: Number(row.balance_remaining ?? 0),
    creditKind: row.credit_kind ?? "return",
  }));
}

async function listOpenCustomerCreditNotes(userId: string, storeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("erp_credit_notes")
    .select("id, credit_note_number, credit_note_date, balance_remaining, credit_kind")
    .eq("user_id", userId)
    .eq("store_id", storeId)
    .gt("balance_remaining", 0)
    .in("status", ["issued", "applied"])
    .order("credit_note_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    number: row.credit_note_number,
    date: row.credit_note_date,
    balanceRemaining: Number(row.balance_remaining ?? 0),
    creditKind: row.credit_kind ?? "return",
  }));
}

export async function getSupplierSettlementPreview(
  vendorId: string,
  storeId?: string,
): Promise<AccountSettlementPreview> {
  await requireAdminOrManagerProfile();
  const activeStoreId = await requireErpStoreId(storeId);
  const summary = await getVendorErpSummary(vendorId, activeStoreId);

  const bills = await listPayableBillsForVendor(vendorId, activeStoreId);
  const documents: SettlementDocumentLine[] = bills.map((b) => ({
    id: b.id,
    number: b.purchase_bill_number,
    date: b.purchase_date,
    balance: b.balance_due,
  }));

  const creditRows = await listOpenVendorCredits(vendorId, activeStoreId);
  const credits: SettlementCreditLine[] = creditRows.map((c) => ({
    id: c.id,
    number: c.number,
    date: c.date,
    balanceRemaining: c.balanceRemaining,
    creditKind: c.creditKind,
  }));

  const documentTotal = quantizePaymentAmount(
    documents.reduce((s, d) => s + d.balance, 0),
  );
  const creditTotal = quantizePaymentAmount(
    credits.reduce((s, c) => s + c.balanceRemaining, 0),
  );

  const { plans, documentsAfter } = planCreditApplications(documents, credits);
  const documentTotalAfterCredits = quantizePaymentAmount(
    documentsAfter.reduce((s, d) => s + d.balance, 0),
  );

  const openingBalance = quantizePaymentAmount(summary.openingBalance);
  const netBalance = quantizePaymentAmount(summary.balanceDue);

  let openingBalanceNote: string | null = null;
  if (openingBalance > PAYMENT_BALANCE_TOLERANCE) {
    openingBalanceNote =
      "Opening balance is included in the net total. Document allocations clear bills only; any opening portion is recorded as unallocated cash on the payment.";
  }

  return {
    side: "supplier",
    openingBalance,
    documents,
    documentTotal,
    credits,
    creditTotal,
    netBalance,
    documentTotalAfterCredits,
    plannedCreditApplications: plans,
    documentSettleTotal: documentTotalAfterCredits,
    openingBalanceNote,
  };
}

export async function getCustomerSettlementPreview(
  userId: string,
  storeId?: string,
): Promise<AccountSettlementPreview> {
  await requireAdminOrManagerProfile();
  const activeStoreId = await requireErpStoreId(storeId);
  const summary = await getCustomerErpSummary(userId, activeStoreId);

  const invoices = await listReceivableInvoicesForCustomer(userId, activeStoreId);
  const documents: SettlementDocumentLine[] = invoices.map((inv) => ({
    id: inv.id,
    number: inv.invoice_number,
    date: inv.due_date,
    balance: inv.balance_due,
  }));

  const creditRows = await listOpenCustomerCreditNotes(userId, activeStoreId);
  const credits: SettlementCreditLine[] = creditRows.map((c) => ({
    id: c.id,
    number: c.number,
    date: c.date,
    balanceRemaining: c.balanceRemaining,
    creditKind: c.creditKind,
  }));

  const documentTotal = quantizePaymentAmount(
    documents.reduce((s, d) => s + d.balance, 0),
  );
  const creditTotal = quantizePaymentAmount(
    credits.reduce((s, c) => s + c.balanceRemaining, 0),
  );

  const { plans, documentsAfter } = planCreditApplications(documents, credits);
  const documentTotalAfterCredits = quantizePaymentAmount(
    documentsAfter.reduce((s, d) => s + d.balance, 0),
  );

  const openingBalance = quantizePaymentAmount(summary.openingBalance);
  const netBalance = quantizePaymentAmount(summary.balanceDue);

  let openingBalanceNote: string | null = null;
  if (openingBalance > PAYMENT_BALANCE_TOLERANCE) {
    openingBalanceNote =
      "Opening balance is included in the net total. Invoice allocations clear open invoices only; any opening portion is recorded as unallocated cash on the payment.";
  }

  return {
    side: "customer",
    openingBalance,
    documents,
    documentTotal,
    credits,
    creditTotal,
    netBalance,
    documentTotalAfterCredits,
    plannedCreditApplications: plans,
    documentSettleTotal: documentTotalAfterCredits,
    openingBalanceNote,
  };
}

export async function recordAccountSettlement(input: {
  side: SettlementSide;
  partyId: string;
  storeId?: string;
  paymentDate: string;
  paymentMode: string;
  accountId: string;
  settlementDiscount?: number;
  settlementDiscountAccountId?: string | null;
  reference?: string;
  notes?: string;
}): Promise<string> {
  await requireAdminOrManagerProfile();
  const storeId = await requireErpStoreId(input.storeId);
  const discount = quantizePaymentAmount(input.settlementDiscount ?? 0);

  const preview =
    input.side === "supplier"
      ? await getSupplierSettlementPreview(input.partyId, storeId)
      : await getCustomerSettlementPreview(input.partyId, storeId);

  if (preview.netBalance <= PAYMENT_BALANCE_TOLERANCE) {
    throw new Error("No account balance to settle.");
  }

  if (discount > 0 && preview.documentSettleTotal <= PAYMENT_BALANCE_TOLERANCE) {
    throw new Error("No open document balance for a settlement discount.");
  }

  if (
    discount >= preview.documentSettleTotal &&
    preview.documentSettleTotal > PAYMENT_BALANCE_TOLERANCE
  ) {
    throw new Error("Discount must be less than the document balance to settle.");
  }

  if (discount > 0 && !input.settlementDiscountAccountId) {
    throw new Error(
      input.side === "supplier"
        ? "Income account is required for settlement discount."
        : "Expense account is required for settlement discount.",
    );
  }

  for (const plan of preview.plannedCreditApplications) {
    if (input.side === "supplier") {
      await applyVendorCredit({
        creditId: plan.creditId,
        billId: plan.documentId,
        amount: plan.amount,
      });
    } else {
      await applyCreditNoteToInvoice(plan.creditId, plan.documentId, plan.amount);
    }
  }

  const freshPreview =
    input.side === "supplier"
      ? await getSupplierSettlementPreview(input.partyId, storeId)
      : await getCustomerSettlementPreview(input.partyId, storeId);

  const docLines = freshPreview.documents.filter(
    (d) => d.balance > PAYMENT_BALANCE_TOLERANCE,
  );

  if (freshPreview.netBalance <= PAYMENT_BALANCE_TOLERANCE) {
    throw new Error("Account is already settled after applying credits.");
  }

  const allocations =
    input.side === "supplier"
      ? docLines.map((d) => ({
          purchaseBillId: d.id,
          amount: quantizePaymentAmount(d.balance),
        }))
      : docLines.map((d) => ({
          invoiceId: d.id,
          amount: quantizePaymentAmount(d.balance),
        }));

  const allocTotal = quantizePaymentAmount(
    allocations.reduce(
      (s, a) => s + ("amount" in a ? a.amount : 0),
      0,
    ),
  );

  const openingPortion = quantizePaymentAmount(
    Math.max(0, freshPreview.netBalance - allocTotal),
  );

  if (discount > 0 && openingPortion > PAYMENT_BALANCE_TOLERANCE) {
    throw new Error(
      "Settlement discount applies to open documents only. Clear or pay opening balance in a separate payment without discount.",
    );
  }

  const documentCash = quantizePaymentAmount(Math.max(0, allocTotal - discount));
  const totalAmount =
    discount > 0
      ? documentCash
      : quantizePaymentAmount(documentCash + openingPortion);

  if (totalAmount <= PAYMENT_BALANCE_TOLERANCE) {
    throw new Error("Amount to pay must be positive.");
  }

  if (discount > 0 && Math.abs(allocTotal - (totalAmount + discount)) > 0.02) {
    throw new Error("Allocation total must equal document payment plus settlement discount.");
  }

  const settlementNote = `Account settlement${discount > 0 ? ` (discount ${discount})` : ""}`;

  if (input.side === "supplier") {
    return recordSupplierPayment({
      vendorId: input.partyId,
      storeId,
      paymentDate: input.paymentDate,
      paymentMode: input.paymentMode,
      accountId: input.accountId,
      totalAmount,
      settlementDiscount: discount,
      settlementDiscountAccountId: input.settlementDiscountAccountId,
      reference: input.reference,
      notes: input.notes ?? settlementNote,
      allocations: allocations as Array<{ purchaseBillId: string; amount: number }>,
    });
  }

  return recordCustomerPayment({
    userId: input.partyId,
    storeId,
    paymentDate: input.paymentDate,
    paymentMode: input.paymentMode,
    accountId: input.accountId,
    totalAmount,
    settlementDiscount: discount,
    settlementDiscountAccountId: input.settlementDiscountAccountId,
    reference: input.reference,
    notes: input.notes ?? settlementNote,
    allocations: allocations as Array<{ invoiceId: string; amount: number }>,
  });
}
