"use client";

import { useMemo, useRef } from "react";

import { formatErpDocRef, type ErpDocKind } from "@/lib/erp-document-ref";

export type ErpDocumentDraft = {
  draftId: string;
  documentNumber: string;
};

/** Stable draft id + formatted ref (e.g. PB-A3F2B) for a new ERP document form session. */
export function useErpDocumentDraft(
  kind: ErpDocKind,
  enabled = true,
  /** Bump after "save & next" to allocate a new draft number without remounting the form. */
  resetToken = 0,
): ErpDocumentDraft | null {
  const draftIdRef = useRef<string | null>(null);
  const resetTokenRef = useRef(resetToken);
  if (resetTokenRef.current !== resetToken) {
    resetTokenRef.current = resetToken;
    draftIdRef.current = null;
  }
  if (enabled && !draftIdRef.current) {
    draftIdRef.current = crypto.randomUUID();
  }

  return useMemo(() => {
    if (!enabled || !draftIdRef.current) return null;
    return {
      draftId: draftIdRef.current,
      documentNumber: formatErpDocRef(kind, draftIdRef.current),
    };
  }, [enabled, kind, resetToken]);
}

export const ERP_DOC_FIELD_LABELS: Record<ErpDocKind, string> = {
  INV: "Invoice #",
  EST: "Estimate #",
  SO: "Order #",
  CN: "Credit note #",
  PB: "Bill #",
  PO: "PO #",
  VC: "Vendor credit #",
  EXP: "Expense #",
  PR: "Payment #",
  CPM: "Bulk payment #",
  PM: "Payment #",
  SPM: "Bulk payment #",
  SA: "Adjustment #",
  TR: "Request #",
  ST: "Transfer #",
  TP: "Transfer payment #",
  JE: "Journal #",
  FA: "Asset #",
  VR: "VAT return #",
  VP: "VAT payment #",
  PW: "Withdrawal #",
};
