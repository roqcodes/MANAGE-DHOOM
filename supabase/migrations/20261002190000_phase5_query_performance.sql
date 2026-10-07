-- Phase 5: Query performance — batch RPCs and targeted indexes (no UX change).

BEGIN;

-- ─── Batch account balances (chart of accounts / banking lists) ─────────────

CREATE OR REPLACE FUNCTION public.get_account_balances(p_account_ids uuid[])
RETURNS TABLE(account_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    COALESCE(a.opening_balance, 0)
      + COALESCE(SUM(l.debit_amount), 0)
      - COALESCE(SUM(l.credit_amount), 0)
  FROM unnest(p_account_ids) AS ids(id)
  INNER JOIN public.accounts a ON a.id = ids.id
  LEFT JOIN public.journal_entry_lines l ON l.account_id = a.id
  LEFT JOIN public.journal_entries j ON j.id = l.journal_entry_id AND j.status = 'posted'
  GROUP BY a.id, a.opening_balance;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_balances(uuid[]) TO authenticated;

-- ─── Batch online availability (cart / ecommerce checkout) ───────────────────

CREATE OR REPLACE FUNCTION public.get_variants_online_available(p_variant_ids uuid[])
RETURNS TABLE(variant_id uuid, available numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ids.id,
    COALESCE(
      (
        SELECT SUM(public.online_inventory_available(s.id, ids.id))
        FROM public.stores s
        WHERE s.is_active = true
      ),
      0
    )
  FROM unnest(p_variant_ids) AS ids(id);
$$;

GRANT EXECUTE ON FUNCTION public.get_variants_online_available(uuid[]) TO authenticated;

-- ─── Batch store variant availability (POS counter sales) ───────────────────

CREATE OR REPLACE FUNCTION public.get_variants_store_inventory_available(
  p_store_id uuid,
  p_variant_ids uuid[]
)
RETURNS TABLE(variant_id uuid, available numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    ids.id,
    GREATEST(
      0,
      FLOOR(
        COALESCE(i.stock, 0) - COALESCE(i.reserved_stock, 0)
      )
    )
  FROM unnest(p_variant_ids) AS ids(id)
  LEFT JOIN public.inventory i
    ON i.store_id = p_store_id AND i.variant_id = ids.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_variants_store_inventory_available(uuid, uuid[]) TO authenticated;

-- ─── Order counts for admin order list (per customer on page) ───────────────

CREATE OR REPLACE FUNCTION public.get_user_order_counts(p_user_ids uuid[])
RETURNS TABLE(user_id uuid, order_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.user_id, COUNT(*)::bigint
  FROM public.orders o
  WHERE o.user_id = ANY (p_user_ids)
  GROUP BY o.user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_order_counts(uuid[]) TO authenticated;

-- ─── Customer payment list summary (mode totals without full table scan in app) ─

CREATE OR REPLACE FUNCTION public.summarize_erp_customer_payments(
  p_store_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL
)
RETURNS TABLE(payment_mode text, total_amount numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.payment_mode, COALESCE(SUM(p.total_amount), 0)
  FROM public.erp_customer_payments p
  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
    AND (p_date_from IS NULL OR p.payment_date >= p_date_from)
    AND (p_date_to IS NULL OR p.payment_date <= p_date_to)
  GROUP BY p.payment_mode;
$$;

GRANT EXECUTE ON FUNCTION public.summarize_erp_customer_payments(uuid, date, date) TO authenticated;

-- ─── Indexes (verified access patterns; PK/FK coverage checked) ─────────────

CREATE INDEX IF NOT EXISTS orders_store_id_created_at_idx
  ON public.orders (store_id, created_at DESC);

CREATE INDEX IF NOT EXISTS orders_user_id_idx
  ON public.orders (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS erp_customer_payments_store_payment_date_idx
  ON public.erp_customer_payments (store_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS erp_supplier_payments_idempotency_lookup_idx
  ON public.erp_supplier_payments (vendor_id, store_id, reference, total_amount, is_bulk)
  WHERE reference IS NOT NULL AND TRIM(reference) <> '';

CREATE INDEX IF NOT EXISTS stock_movements_product_store_created_idx
  ON public.stock_movements (product_id, store_id, created_at DESC)
  WHERE product_id IS NOT NULL;

COMMIT;
