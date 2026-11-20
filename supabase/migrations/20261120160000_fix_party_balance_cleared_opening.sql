-- Fix customer and vendor exposure functions to subtract unallocated payments and credits
-- so that cleared opening balances (and unallocated payments / credit notes) are properly reflected
-- in customer and vendor search suggestions across sales, purchase, payment, and settlement modals.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_ar_exposure(
  p_user_id uuid,
  p_exclude_invoice_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric := 0;
  v_invoices numeric := 0;
  v_unallocated numeric := 0;
  v_credits numeric := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(u.opening_balance, 0)
  INTO v_opening
  FROM public.users u
  WHERE u.id = p_user_id;

  SELECT COALESCE(SUM(i.balance_due), 0)
  INTO v_invoices
  FROM public.invoices i
  WHERE i.user_id = p_user_id
    AND i.status <> 'cancelled'
    AND COALESCE(i.balance_due, 0) > 0
    AND (p_exclude_invoice_id IS NULL OR i.id <> p_exclude_invoice_id);

  SELECT COALESCE(SUM(p.unallocated_amount), 0)
  INTO v_unallocated
  FROM public.erp_customer_payments p
  WHERE p.user_id = p_user_id
    AND COALESCE(p.unallocated_amount, 0) > 0;

  SELECT COALESCE(SUM(cn.balance_remaining), 0)
  INTO v_credits
  FROM public.erp_credit_notes cn
  WHERE cn.user_id = p_user_id
    AND cn.status IN ('issued', 'applied')
    AND COALESCE(cn.balance_remaining, 0) > 0;

  RETURN COALESCE(v_opening, 0) + COALESCE(v_invoices, 0) - COALESCE(v_credits, 0) - COALESCE(v_unallocated, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_ar_exposure(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_ar_exposure(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_vendor_ap_exposure(p_vendor_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opening numeric := 0;
  v_payables numeric := 0; 
  v_credits numeric := 0;
  v_unallocated numeric := 0;
BEGIN
  IF p_vendor_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COALESCE(v.opening_balance, 0)
  INTO v_opening
  FROM public.vendors v
  WHERE v.id = p_vendor_id;

  SELECT COALESCE(SUM(b.balance_due), 0)
  INTO v_payables
  FROM public.erp_purchase_bills b
  WHERE b.vendor_id = p_vendor_id
    AND b.status IN ('finalized', 'partial', 'paid')
    AND COALESCE(b.balance_due, 0) > 0;

  SELECT COALESCE(SUM(c.balance_remaining), 0)
  INTO v_credits
  FROM public.erp_vendor_credits c
  WHERE c.vendor_id = p_vendor_id
    AND c.status IN ('issued', 'applied')
    AND COALESCE(c.balance_remaining, 0) > 0;

  SELECT COALESCE(SUM(p.unallocated_amount), 0)
  INTO v_unallocated
  FROM public.erp_supplier_payments p
  WHERE p.vendor_id = p_vendor_id
    AND COALESCE(p.unallocated_amount, 0) > 0;

  RETURN COALESCE(v_opening, 0) + COALESCE(v_payables, 0) - COALESCE(v_credits, 0) - COALESCE(v_unallocated, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_vendor_ap_exposure(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_vendor_ap_exposure(uuid) TO authenticated;

-- Ensure performance indexes for unallocated payments and credits
CREATE INDEX IF NOT EXISTS idx_erp_customer_payments_user_unallocated
  ON public.erp_customer_payments (user_id)
  WHERE COALESCE(unallocated_amount, 0) > 0;

CREATE INDEX IF NOT EXISTS idx_erp_credit_notes_user_balance_remaining
  ON public.erp_credit_notes (user_id)
  WHERE status IN ('issued', 'applied') AND COALESCE(balance_remaining, 0) > 0;

CREATE INDEX IF NOT EXISTS idx_erp_supplier_payments_vendor_unallocated
  ON public.erp_supplier_payments (vendor_id)
  WHERE COALESCE(unallocated_amount, 0) > 0;

CREATE INDEX IF NOT EXISTS idx_erp_vendor_credits_vendor_balance_remaining
  ON public.erp_vendor_credits (vendor_id)
  WHERE status IN ('issued', 'applied') AND COALESCE(balance_remaining, 0) > 0;

COMMIT;
