-- Indexes for ERP report RPCs (receivables, payables, sales, accountant).

BEGIN;

CREATE INDEX IF NOT EXISTS invoices_user_store_status_idx
  ON public.invoices (user_id, store_id)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS invoices_store_open_balance_idx
  ON public.invoices (store_id, user_id, due_date)
  WHERE status <> 'cancelled' AND ABS(balance_due) > 0.001;

CREATE INDEX IF NOT EXISTS invoices_store_created_idx
  ON public.invoices (store_id, created_at DESC)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS users_receivables_report_idx
  ON public.users (name)
  WHERE role IS NULL OR role::text = 'customer';

CREATE INDEX IF NOT EXISTS erp_purchase_bills_vendor_store_idx
  ON public.erp_purchase_bills (vendor_id, store_id, purchase_date DESC)
  WHERE status IN ('finalized', 'partial', 'paid');

CREATE INDEX IF NOT EXISTS erp_purchase_bills_open_balance_idx
  ON public.erp_purchase_bills (vendor_id, store_id, due_date)
  WHERE status IN ('finalized', 'partial', 'paid') AND ABS(balance_due) > 0.001;

CREATE INDEX IF NOT EXISTS vendors_active_name_idx
  ON public.vendors (name)
  WHERE is_active IS DISTINCT FROM false;

CREATE INDEX IF NOT EXISTS erp_customer_payments_user_store_idx
  ON public.erp_customer_payments (user_id, store_id)
  WHERE unallocated_amount > 0.001;

CREATE INDEX IF NOT EXISTS erp_supplier_payments_vendor_store_idx
  ON public.erp_supplier_payments (vendor_id, store_id)
  WHERE unallocated_amount > 0.001;

CREATE INDEX IF NOT EXISTS journal_entry_lines_account_idx
  ON public.journal_entry_lines (account_id);

CREATE INDEX IF NOT EXISTS journal_entries_store_transaction_date_idx
  ON public.journal_entries (store_id, transaction_date);

CREATE INDEX IF NOT EXISTS erp_credit_notes_store_date_idx
  ON public.erp_credit_notes (store_id, credit_note_date DESC);

CREATE INDEX IF NOT EXISTS erp_vendor_credits_vendor_store_idx
  ON public.erp_vendor_credits (vendor_id, store_id)
  WHERE status IN ('issued', 'applied');

COMMIT;
