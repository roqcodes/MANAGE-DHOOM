/** HR module types (employees, salary payments, pay slips). */

export const ERP_SALARY_PAYMENT_MODES = [
  "Cash",
  "Card",
  "Cheque",
  "Bank Remittance",
  "Bank Transfer",
] as const;

export type ErpSalaryPaymentMode = (typeof ERP_SALARY_PAYMENT_MODES)[number];

export interface ErpEmployeeListRow {
  id: string;
  employee_number: string;
  employee_code: string | null;
  store_id: string;
  full_name: string;
  mobile: string;
  id_number: string | null;
  id_expiry_date: string | null;
  joining_date: string;
  is_active: boolean;
  discontinuation_date: string | null;
  basic_salary: number;
  allowance: number;
  net_salary: number;
  salary_balance: number;
  advance_balance: number;
  store_name: string | null;
}

export interface ErpEmployeeDetail extends ErpEmployeeListRow {
  date_of_birth: string | null;
  notes: string | null;
  created_at: string;
  ledger: ErpEmployeeLedgerRow[];
}

export interface ErpEmployeeLedgerRow {
  id: string;
  entry_date: string;
  entry_type: string;
  description: string;
  salary_credit: number;
  payment_debit: number;
  balance_after: number;
}

export interface ErpSalaryPaymentListRow {
  id: string;
  payment_number: string;
  employee_id: string;
  employee_name: string | null;
  store_id: string;
  store_name: string | null;
  payment_date: string;
  total_paid_amount: number;
  salary_payment_amount: number;
  advance_payment_amount: number;
  advance_balance_after: number;
  payment_mode: string;
  paid_through_name: string | null;
  bulk_payment_id: string | null;
}

export interface ErpSalaryPaymentDetail extends ErpSalaryPaymentListRow {
  advance_recovery_amount: number;
  notes: string | null;
  created_at: string;
}

export interface ErpSalaryBulkPaymentListRow {
  id: string;
  bulk_number: string;
  store_id: string;
  store_name: string | null;
  payment_date: string;
  payment_mode: string;
  paid_through_name: string | null;
  total_amount: number;
  notes: string | null;
  reference: string | null;
}

export interface ErpSalaryBulkPaymentLine {
  employee_id: string;
  employee_name: string;
  salary_balance: number;
  advance_balance: number;
  payment_from_advance: number;
  salary_payment: number;
  total_payment: number;
  comment: string | null;
}

export interface ErpPaySlipListRow {
  id: string;
  payslip_number: string;
  employee_id: string;
  employee_name: string | null;
  store_id: string;
  store_name: string | null;
  period_month: number;
  period_year: number;
  period_label: string;
  from_date: string;
  to_date: string;
  days_count: number;
  basic_salary: number;
  allowance: number;
  net_salary: number;
}

export interface ErpEmployeeOpeningBalanceListRow {
  id: string;
  batch_number: string;
  store_id: string;
  store_name: string | null;
  entry_date: string;
  notes: string | null;
  total_amount: number;
}

export interface ErpEmployeeOpeningBalanceLineInput {
  employee_id: string;
  opening_balance: number;
  joining_date?: string;
}

export interface ErpEmployeeOption {
  id: string;
  full_name: string;
  employee_number: string;
  salary_balance: number;
  advance_balance: number;
  net_salary: number;
  store_id: string;
}
