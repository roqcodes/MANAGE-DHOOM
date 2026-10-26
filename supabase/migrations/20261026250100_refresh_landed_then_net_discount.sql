-- After landed refresh, keep unit_net_acquisition_cost in sync (discount proration).

BEGIN;

CREATE OR REPLACE FUNCTION public.refresh_purchase_bill_landed_allocations(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
  v_existing numeric := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.erp_purchase_bill_landed_costs
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(landed_cost_allocated), 0)
  INTO v_existing
  FROM public.erp_purchase_bill_lines
  WHERE purchase_bill_id = p_bill_id
    AND quantity > 0;

  IF v_landed_total > 0
     AND v_existing > 0
     AND abs(public.erp_round_calc(v_existing) - public.erp_round_calc(v_landed_total)) < 0.0001 THEN
    UPDATE public.erp_purchase_bill_lines
    SET unit_loaded_cost = purchase_price + (
      GREATEST(0, COALESCE(landed_cost_allocated, 0)) / NULLIF(quantity, 0)
    )
    WHERE purchase_bill_id = p_bill_id;
  ELSE
    PERFORM public.erp_prorate_purchase_bill_landed(p_bill_id);
  END IF;

  PERFORM public.erp_allocate_purchase_bill_discount(p_bill_id);
END;
$$;

COMMIT;
