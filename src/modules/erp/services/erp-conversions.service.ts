import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { logAuditEvent } from "@/modules/erp/services/audit-log.service";
import { createErpInvoice } from "@/modules/erp/services/erp-invoices.service";
import { convertOrderToInvoice } from "@/modules/erp/services/convert-order-to-invoice.service";

export async function convertSalesOrderToInvoice(orderId: string): Promise<string> {
  return convertOrderToInvoice(orderId);
}

export async function billExpenseToCustomer(expenseId: string): Promise<string> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: expense, error } = await supabase
    .from("erp_expenses")
    .select("*")
    .eq("id", expenseId)
    .single();

  if (error) throw new Error(error.message);
  const expenseRow = expense as typeof expense & {
    is_billable?: boolean;
    billable_customer_id?: string | null;
    billed_invoice_id?: string | null;
  };

  if (!expenseRow.is_billable) throw new Error("Expense is not marked as billable.");
  if (!expenseRow.billable_customer_id) throw new Error("Billable customer is required.");
  if (expenseRow.billed_invoice_id) throw new Error("Expense has already been invoiced.");

  const total = Number(expense.total_amount ?? expense.amount ?? 0);
  const taxPercent = Number(expense.tax_percent ?? 0);

  const invoiceId = await createErpInvoice({
    userId: expenseRow.billable_customer_id,
    storeId: expense.store_id ?? undefined,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: new Date().toISOString().slice(0, 10),
    lines: [
      {
        productName: expense.reference?.trim() || "Billable expense",
        description: expense.notes ?? undefined,
        quantity: 1,
        unitPrice: total,
        taxRatePercent: taxPercent,
      },
    ],
    notes: `Billable expense ${expense.reference ?? expenseId}`,
    finalize: true,
  });

  await supabase
    .from("erp_expenses")
    .update({ billed_invoice_id: invoiceId } as never)
    .eq("id", expenseId);

  await logAuditEvent({
    action: "bill_expense",
    entityType: "expense",
    entityId: expenseId,
    description: `Billable expense invoiced`,
    storeId: expense.store_id ?? undefined,
  });

  return invoiceId;
}
