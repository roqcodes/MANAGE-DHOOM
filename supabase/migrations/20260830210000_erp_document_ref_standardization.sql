-- Standardize ERP document numbers as PREFIX-XXXXX (5-char code from row UUID).
-- Replaces sequential PB1/PO1 style with stable, identifiable refs at the DB layer.

BEGIN;

-- ─── Core formatter (matches app erpShortCode + formatErpDocRef) 

CREATE OR REPLACE FUNCTION public.erp_format_document_ref(
  p_prefix text,
  p_id uuid,
  p_code_length int DEFAULT 5
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT
    CASE
      WHEN p_id IS NULL THEN NULL
      WHEN p_prefix IS NULL OR BTRIM(p_prefix) = '' THEN
        UPPER(SUBSTRING(REPLACE(p_id::text, '-', ''), 1, GREATEST(p_code_length, 1)))
      ELSE
        BTRIM(p_prefix) || '-' ||
        UPPER(SUBSTRING(REPLACE(p_id::text, '-', ''), 1, GREATEST(p_code_length, 1)))
    END;
$$;

COMMENT ON FUNCTION public.erp_format_document_ref(text, uuid, int) IS
  'ERP display number e.g. PB-9CCA1 from UUID primary key (5 hex chars).';

-- Normalize sequence prefixes used for lookup / legacy RPCs
UPDATE public.erp_document_sequences SET prefix = 'VR' WHERE document_type = 'vat_return' AND (prefix IS NULL OR prefix = '');
UPDATE public.erp_document_sequences SET prefix = 'VP' WHERE document_type = 'vat_payment' AND (prefix IS NULL OR prefix = '');
UPDATE public.erp_document_sequences SET prefix = 'TR' WHERE document_type = 'transfer_request' AND prefix = 'STR';
UPDATE public.erp_document_sequences SET prefix = 'TP' WHERE document_type = 'transfer_payment' AND prefix = 'STP';

-- ─── BEFORE INSERT trigger: assign number from row id ───────────────────────

CREATE OR REPLACE FUNCTION public.erp_trg_assign_document_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix text := NULLIF(BTRIM(TG_ARGV[0]), '');
  v_column text := TG_ARGV[1];
  v_ref text;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  IF v_prefix IS NULL THEN
    RETURN NEW;
  END IF;

  v_ref := public.erp_format_document_ref(v_prefix, NEW.id);

  CASE v_column
    WHEN 'invoice_number' THEN NEW.invoice_number := v_ref;
    WHEN 'estimate_number' THEN NEW.estimate_number := v_ref;
    WHEN 'sales_order_number' THEN NEW.sales_order_number := v_ref;
    WHEN 'credit_note_number' THEN NEW.credit_note_number := v_ref;
    WHEN 'purchase_bill_number' THEN NEW.purchase_bill_number := v_ref;
    WHEN 'po_number' THEN NEW.po_number := v_ref;
    WHEN 'credit_number' THEN NEW.credit_number := v_ref;
    WHEN 'expense_number' THEN NEW.expense_number := v_ref;
    WHEN 'payment_number' THEN NEW.payment_number := v_ref;
    WHEN 'adjustment_number' THEN NEW.adjustment_number := v_ref;
    WHEN 'request_number' THEN NEW.request_number := v_ref;
    WHEN 'transfer_number' THEN NEW.transfer_number := v_ref;
    WHEN 'journal_number' THEN NEW.journal_number := v_ref;
    WHEN 'transaction_number' THEN NEW.transaction_number := v_ref;
    WHEN 'return_number' THEN NEW.return_number := v_ref;
    WHEN 'asset_number' THEN NEW.asset_number := v_ref;
    ELSE
      RAISE EXCEPTION 'erp_trg_assign_document_ref: unsupported column %', v_column;
  END CASE;

  RETURN NEW;
END;
$$;

-- Customer payments: CPM when bulk, else PR
CREATE OR REPLACE FUNCTION public.erp_trg_assign_customer_payment_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  NEW.payment_number := public.erp_format_document_ref(
    CASE WHEN COALESCE(NEW.is_bulk, false) THEN 'CPM' ELSE 'PR' END,
    NEW.id
  );
  RETURN NEW;
END;
$$;

-- Supplier payments: SPM when bulk, else PM
CREATE OR REPLACE FUNCTION public.erp_trg_assign_supplier_payment_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  NEW.payment_number := public.erp_format_document_ref(
    CASE WHEN COALESCE(NEW.is_bulk, false) THEN 'SPM' ELSE 'PM' END,
    NEW.id
  );
  RETURN NEW;
END;
$$;

-- Account transactions: PW for profit withdrawals, else AT
CREATE OR REPLACE FUNCTION public.erp_trg_assign_account_transaction_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;
  NEW.transaction_number := public.erp_format_document_ref(
    CASE WHEN NEW.transaction_type = 'profit_withdrawal' THEN 'PW' ELSE 'AT' END,
    NEW.id
  );
  RETURN NEW;
END;
$$;

-- ─── Attach triggers (INSERT only — numbers are immutable after create) ─────

DROP TRIGGER IF EXISTS trg_erp_invoices_document_ref ON public.invoices;
CREATE TRIGGER trg_erp_invoices_document_ref
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('INV', 'invoice_number');

DROP TRIGGER IF EXISTS trg_erp_estimates_document_ref ON public.erp_estimates;
CREATE TRIGGER trg_erp_estimates_document_ref
  BEFORE INSERT ON public.erp_estimates
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('EST', 'estimate_number');

DROP TRIGGER IF EXISTS trg_orders_sales_order_document_ref ON public.orders;
CREATE TRIGGER trg_orders_sales_order_document_ref
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.source = 'sales_order')
  EXECUTE FUNCTION public.erp_trg_assign_document_ref('SO', 'sales_order_number');

DROP TRIGGER IF EXISTS trg_erp_credit_notes_document_ref ON public.erp_credit_notes;
CREATE TRIGGER trg_erp_credit_notes_document_ref
  BEFORE INSERT ON public.erp_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('CN', 'credit_note_number');

DROP TRIGGER IF EXISTS trg_erp_purchase_bills_document_ref ON public.erp_purchase_bills;
CREATE TRIGGER trg_erp_purchase_bills_document_ref
  BEFORE INSERT ON public.erp_purchase_bills
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('PB', 'purchase_bill_number');

DROP TRIGGER IF EXISTS trg_purchase_orders_document_ref ON public.purchase_orders;
CREATE TRIGGER trg_purchase_orders_document_ref
  BEFORE INSERT ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('PO', 'po_number');

DROP TRIGGER IF EXISTS trg_erp_vendor_credits_document_ref ON public.erp_vendor_credits;
CREATE TRIGGER trg_erp_vendor_credits_document_ref
  BEFORE INSERT ON public.erp_vendor_credits
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('VC', 'credit_number');

DROP TRIGGER IF EXISTS trg_erp_expenses_document_ref ON public.erp_expenses;
CREATE TRIGGER trg_erp_expenses_document_ref
  BEFORE INSERT ON public.erp_expenses
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('EXP', 'expense_number');

DROP TRIGGER IF EXISTS trg_erp_customer_payments_document_ref ON public.erp_customer_payments;
CREATE TRIGGER trg_erp_customer_payments_document_ref
  BEFORE INSERT ON public.erp_customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_customer_payment_ref();

DROP TRIGGER IF EXISTS trg_erp_supplier_payments_document_ref ON public.erp_supplier_payments;
CREATE TRIGGER trg_erp_supplier_payments_document_ref
  BEFORE INSERT ON public.erp_supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_supplier_payment_ref();

DROP TRIGGER IF EXISTS trg_erp_stock_adjustments_document_ref ON public.erp_stock_adjustments;
CREATE TRIGGER trg_erp_stock_adjustments_document_ref
  BEFORE INSERT ON public.erp_stock_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('SA', 'adjustment_number');

DROP TRIGGER IF EXISTS trg_erp_transfer_requests_document_ref ON public.erp_transfer_requests;
CREATE TRIGGER trg_erp_transfer_requests_document_ref
  BEFORE INSERT ON public.erp_transfer_requests
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('TR', 'request_number');

DROP TRIGGER IF EXISTS trg_erp_store_transfers_document_ref ON public.erp_store_transfers;
CREATE TRIGGER trg_erp_store_transfers_document_ref
  BEFORE INSERT ON public.erp_store_transfers
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('ST', 'transfer_number');

DROP TRIGGER IF EXISTS trg_erp_transfer_payments_document_ref ON public.erp_transfer_payments;
CREATE TRIGGER trg_erp_transfer_payments_document_ref
  BEFORE INSERT ON public.erp_transfer_payments
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('TP', 'payment_number');

DROP TRIGGER IF EXISTS trg_journal_entries_document_ref ON public.journal_entries;
CREATE TRIGGER trg_journal_entries_document_ref
  BEFORE INSERT ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('JE', 'journal_number');

DROP TRIGGER IF EXISTS trg_erp_account_transactions_document_ref ON public.erp_account_transactions;
CREATE TRIGGER trg_erp_account_transactions_document_ref
  BEFORE INSERT ON public.erp_account_transactions
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_account_transaction_ref();

DROP TRIGGER IF EXISTS trg_erp_vat_returns_document_ref ON public.erp_vat_returns;
CREATE TRIGGER trg_erp_vat_returns_document_ref
  BEFORE INSERT ON public.erp_vat_returns
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('VR', 'return_number');

DROP TRIGGER IF EXISTS trg_erp_vat_payments_document_ref ON public.erp_vat_payments;
CREATE TRIGGER trg_erp_vat_payments_document_ref
  BEFORE INSERT ON public.erp_vat_payments
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('VP', 'payment_number');

DROP TRIGGER IF EXISTS trg_erp_fixed_assets_document_ref ON public.erp_fixed_assets;
CREATE TRIGGER trg_erp_fixed_assets_document_ref
  BEFORE INSERT ON public.erp_fixed_assets
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_document_ref('FA', 'asset_number');

-- ─── Backfill existing rows ───────────────────────────────────────────────────

UPDATE public.invoices
SET invoice_number = public.erp_format_document_ref('INV', id)
WHERE invoice_number IS NULL
   OR invoice_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_estimates
SET estimate_number = public.erp_format_document_ref('EST', id)
WHERE estimate_number IS NULL
   OR estimate_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.orders
SET sales_order_number = public.erp_format_document_ref('SO', id)
WHERE source = 'sales_order'
  AND (
    sales_order_number IS NULL
    OR sales_order_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$'
  );

UPDATE public.erp_credit_notes
SET credit_note_number = public.erp_format_document_ref('CN', id)
WHERE credit_note_number IS NULL
   OR credit_note_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_purchase_bills
SET purchase_bill_number = public.erp_format_document_ref('PB', id)
WHERE purchase_bill_number IS NULL
   OR purchase_bill_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.purchase_orders
SET po_number = public.erp_format_document_ref('PO', id)
WHERE po_number IS NULL
   OR po_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_vendor_credits
SET credit_number = public.erp_format_document_ref('VC', id)
WHERE credit_number IS NULL
   OR credit_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_expenses
SET expense_number = public.erp_format_document_ref('EXP', id)
WHERE expense_number IS NULL
   OR expense_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_customer_payments
SET payment_number = public.erp_format_document_ref(
  CASE WHEN COALESCE(is_bulk, false) THEN 'CPM' ELSE 'PR' END,
  id
)
WHERE payment_number IS NULL
   OR payment_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_supplier_payments
SET payment_number = public.erp_format_document_ref(
  CASE WHEN COALESCE(is_bulk, false) THEN 'SPM' ELSE 'PM' END,
  id
)
WHERE payment_number IS NULL
   OR payment_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_stock_adjustments
SET adjustment_number = public.erp_format_document_ref('SA', id)
WHERE adjustment_number IS NULL
   OR adjustment_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_transfer_requests
SET request_number = public.erp_format_document_ref('TR', id)
WHERE request_number IS NULL
   OR request_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_store_transfers
SET transfer_number = public.erp_format_document_ref('ST', id)
WHERE transfer_number IS NULL
   OR transfer_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_transfer_payments
SET payment_number = public.erp_format_document_ref('TP', id)
WHERE payment_number IS NULL
   OR payment_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.journal_entries
SET journal_number = public.erp_format_document_ref('JE', id)
WHERE journal_number IS NULL
   OR journal_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_account_transactions
SET transaction_number = public.erp_format_document_ref(
  CASE WHEN transaction_type = 'profit_withdrawal' THEN 'PW' ELSE 'AT' END,
  id
)
WHERE transaction_number IS NULL
   OR transaction_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_vat_returns
SET return_number = public.erp_format_document_ref('VR', id)
WHERE return_number IS NULL
   OR return_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_vat_payments
SET payment_number = public.erp_format_document_ref('VP', id)
WHERE payment_number IS NULL
   OR payment_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

UPDATE public.erp_fixed_assets
SET asset_number = public.erp_format_document_ref('FA', id)
WHERE asset_number IS NULL
   OR asset_number !~ '^[A-Z]{2,3}-[A-F0-9]{5}$';

-- ─── Replace next_erp_document_number: UUID-based when id known, else NULL ──
-- INSERT triggers assign the canonical number. RPCs may still call this after
-- INSERT with RETURNING id for convenience.

DROP FUNCTION IF EXISTS public.next_erp_document_number(text);

CREATE OR REPLACE FUNCTION public.next_erp_document_number(
  p_document_type text,
  p_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT prefix INTO v_prefix
  FROM public.erp_document_sequences
  WHERE document_type = p_document_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  IF p_id IS NOT NULL THEN
    RETURN public.erp_format_document_ref(v_prefix, p_id);
  END IF;

  -- Numbers are assigned by BEFORE INSERT triggers from row id.
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_format_document_ref(text, uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_erp_document_number(text, uuid) TO authenticated;

COMMIT;
