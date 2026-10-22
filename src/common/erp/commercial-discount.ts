import { formatErpDocRef } from "@/lib/erp-document-ref";

export type CommercialDiscountSide = "supplier" | "customer";

export type CreditKind = "return" | "discount";

export type RecordCommercialDiscountInput = {
  side: CommercialDiscountSide;
  partyId: string;
  storeId?: string;
  discountDate: string;
  amount: number;
  taxRatePercent?: number;
  sourceDocumentId?: string | null;
  discountAccountId?: string | null;
  reference?: string;
  notes?: string;
};

export type RecordCommercialDiscountResult = {
  id: string;
  side: CommercialDiscountSide;
};

/** Display ref for customer credit notes: DC for commercial discounts, CN for returns. */
export function formatCustomerCreditNoteRef(row: {
  id: string;
  credit_note_number?: string | null;
  credit_kind?: string | null;
}): string {
  const isDiscount = row.credit_kind === "discount";
  const stored = row.credit_note_number?.trim();
  if (stored) {
    if (isDiscount && /^CN-/i.test(stored)) {
      return formatErpDocRef("DC", row.id);
    }
    return stored;
  }
  return formatErpDocRef(isDiscount ? "DC" : "CN", row.id);
}

export function creditKindLabel(kind: string | null | undefined): string {
  return kind === "discount" ? "Discount" : "Return";
}

/** Account settlement table: distinguish DC discounts from VC/CN returns. */
export function settlementCreditTypeLabel(
  side: CommercialDiscountSide,
  creditKind: string | null | undefined,
  documentNumber?: string | null,
): string {
  if (creditKind === "discount" || (documentNumber?.startsWith("DC-") ?? false)) {
    return "Discount";
  }
  return side === "supplier" ? "Vendor credit" : "Credit note";
}
