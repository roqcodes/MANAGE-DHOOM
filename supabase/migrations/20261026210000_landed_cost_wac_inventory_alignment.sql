-- Restore loaded-unit WAC on purchase bill stock (regressed in 20261002170000_phase3).
-- Align STOCK journal with line inventory compute when bill total = compute + tax.
--
-- Accounting policy (forward):
--   • SPI purchase_price = AVCO of unit_loaded_cost on bill/receive receipt.
--   • Invoice COGS uses SPI WAC (erp_resolve_invoice_line_cost).
--   • STOCK debit on bill = compute_purchase_bill_inventory_amount when
--     compute + tax_amount = total_amount (balanced vendor bill); else
--     total_amount - tax_amount (vendor AP pre-tax is authoritative).
--
-- PB-38CE7 ₹50 gap: compute 2400 vs journal 2350 because total (2650) ≠ compute+tax (2700).
-- No historical journal rewrite; optional SPI backfill via erp_reapply_bill_loaded_wac (staff).

BEGIN;

CREATE OR REPLACE FUNCTION public.purchase_journal_balance_stock_to_ap(
  p_stock numeric,
  p_tax numeric,
  p_ap_total numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN COALESCE(p_ap_total, 0) <= 0 THEN
        GREATEST(0, public.erp_round_calc(COALESCE(p_stock, 0)))
      WHEN COALESCE(p_stock, 0) > 0
        AND abs(
          public.erp_round_calc(COALESCE(p_stock, 0)) + public.erp_round_calc(COALESCE(p_tax, 0))
          - public.erp_round_calc(COALESCE(p_ap_total, 0))
        ) < 0.02 THEN
        public.erp_round_calc(COALESCE(p_stock, 0))
      ELSE
        GREATEST(
          0,
          public.erp_round_calc(COALESCE(p_ap_total, 0) - COALESCE(p_tax, 0))
        )
    END;
$$;

CREATE OR REPLACE FUNCTION public.inventory_apply_purchase_bill_stock(
  p_bill_id uuid,
  p_multiplier integer DEFAULT 1,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_store_id uuid;
  v_delta numeric;
  v_unit numeric;
  v_actor uuid;
  v_committed boolean;
BEGIN
  v_actor := COALESCE(p_user_id, auth.uid());

  IF p_bill_id IS NULL OR p_multiplier NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Invalid purchase bill stock request';
  END IF;

  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_multiplier = 1 AND NOT public.purchase_bill_should_increase_stock_on_finalize(p_bill_id) THEN
    RETURN;
  END IF;

  SELECT store_id, inventory_committed
  INTO v_store_id, v_committed
  FROM public.erp_purchase_bills
  WHERE id = p_bill_id
  FOR UPDATE;

  IF v_store_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill store not found';
  END IF;

  PERFORM public.require_store_access(v_store_id, v_actor);

  IF p_multiplier = 1 AND COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  IF p_multiplier = -1 AND NOT COALESCE(v_committed, false) THEN
    RETURN;
  END IF;

  PERFORM public.refresh_purchase_bill_landed_allocations(p_bill_id);

  FOR r IN
    SELECT
      pbl.id,
      COALESCE(pbl.product_id, pv.product_id) AS product_id,
      pbl.quantity,
      COALESCE(pbl.unit_loaded_cost, pbl.purchase_price) AS unit_cost
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_bill_id
      AND COALESCE(pbl.product_id, pv.product_id) IS NOT NULL
      AND pbl.quantity > 0
  LOOP
    v_delta := r.quantity * p_multiplier;
    v_unit := COALESCE(r.unit_cost, 0);

    PERFORM public.store_product_inventory_apply_receipt_cost(
      v_store_id, r.product_id, v_delta, v_unit, v_actor
    );

    PERFORM public.log_product_stock_movement(
      r.product_id, v_delta, 'purchase', p_bill_id, 'purchase_bill',
      'Purchase Bill Receipt', v_store_id, NULL, v_unit, v_actor
    );
  END LOOP;
END;
$$;

COMMIT;
