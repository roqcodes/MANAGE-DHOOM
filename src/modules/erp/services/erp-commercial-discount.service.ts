import "server-only";

import type {
  CommercialDiscountSide,
  RecordCommercialDiscountInput,
  RecordCommercialDiscountResult,
} from "@/common/erp/commercial-discount";
import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import { requireErpStoreId } from "@/modules/erp/services/store-context.service";
import {
  listExpenseAccounts,
  listIncomeAccounts,
} from "@/modules/erp/services/erp-payments.service";
import { quantizePaymentAmount } from "@/lib/decimal-precision";
import { nullIfEmptyDate } from "@/lib/format-date";

export async function listCommercialDiscountAccounts(
  side: CommercialDiscountSide,
  storeId?: string,
) {
  if (side === "supplier") {
    return listIncomeAccounts(storeId);
  }
  return listExpenseAccounts(storeId);
}

export async function recordCommercialDiscount(
  input: RecordCommercialDiscountInput,
): Promise<RecordCommercialDiscountResult> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const storeId = await requireErpStoreId(input.storeId);
  const amount = quantizePaymentAmount(input.amount);
  const taxRatePercent = quantizePaymentAmount(input.taxRatePercent ?? 0);

  if (input.side !== "supplier" && input.side !== "customer") {
    throw new Error("Side must be supplier or customer");
  }
  if (!input.partyId) {
    throw new Error(input.side === "supplier" ? "Vendor is required" : "Customer is required");
  }
  if (amount <= 0) {
    throw new Error("Discount amount must be greater than zero");
  }

  const discountDate =
    nullIfEmptyDate(input.discountDate) ?? new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase.rpc("record_erp_commercial_discount", {
    p_side: input.side,
    p_party_id: input.partyId,
    p_store_id: storeId,
    p_discount_date: discountDate,
    p_amount: amount,
    p_tax_rate_percent: taxRatePercent,
    p_source_document_id: input.sourceDocumentId || undefined,
    p_discount_account_id: input.discountAccountId || undefined,
    p_reference: input.reference || undefined,
    p_notes: input.notes || undefined,
  });

  if (error) throw new Error(error.message);

  return { id: data as string, side: input.side };
}
