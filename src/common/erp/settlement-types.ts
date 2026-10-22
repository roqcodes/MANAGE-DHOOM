export type SettlementSide = "customer" | "supplier";

export type SettlementDocumentLine = {
  id: string;
  number: string;
  date: string | null;
  balance: number;
};

export type SettlementCreditLine = {
  id: string;
  number: string;
  date: string | null;
  balanceRemaining: number;
  /** return | discount — from erp_vendor_credits / erp_credit_notes */
  creditKind?: string | null;
};

export type SettlementCreditApplicationPlan = {
  creditId: string;
  creditNumber: string;
  documentId: string;
  documentNumber: string;
  amount: number;
};

export type AccountSettlementPreview = {
  side: SettlementSide;
  openingBalance: number;
  documents: SettlementDocumentLine[];
  documentTotal: number;
  credits: SettlementCreditLine[];
  creditTotal: number;
  netBalance: number;
  documentTotalAfterCredits: number;
  plannedCreditApplications: SettlementCreditApplicationPlan[];
  documentSettleTotal: number;
  openingBalanceNote: string | null;
};
