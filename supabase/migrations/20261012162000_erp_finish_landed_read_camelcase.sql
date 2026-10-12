-- erp_finish_*: read landedCostAllocated from payload lines when snake_case key is absent.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_finish_purchase_bill_landed_allocations(
  p_bill_id uuid,
  p_lines jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.erp_purchase_bill_landed_costs
  WHERE purchase_bill_id = p_bill_id;

  IF NOT public.erp_payload_lines_have_balanced_manual_landed(p_lines, v_landed_total) THEN
    PERFORM public.refresh_purchase_bill_landed_allocations(p_bill_id);
    RETURN;
  END IF;

  WITH payload AS (
    SELECT value AS elem, ordinality::int AS ord
    FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY
  ),
  bill_lines AS (
    SELECT id, row_number() OVER (ORDER BY id) AS ord
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = p_bill_id
  )
  UPDATE public.erp_purchase_bill_lines bl
  SET
    landed_cost_allocated = GREATEST(
      0,
      public.erp_round_money_2(
        CASE
          WHEN p.elem ? 'landed_cost_allocated'
            THEN COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0)
          WHEN p.elem ? 'landedCostAllocated'
            THEN COALESCE((p.elem ->> 'landedCostAllocated')::numeric, 0)
          ELSE 0
        END
      )
    ),
    unit_loaded_cost = bl.purchase_price + (
      GREATEST(
        0,
        CASE
          WHEN p.elem ? 'landed_cost_allocated'
            THEN COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0)
          WHEN p.elem ? 'landedCostAllocated'
            THEN COALESCE((p.elem ->> 'landedCostAllocated')::numeric, 0)
          ELSE 0
        END
      ) / NULLIF(bl.quantity, 0)
    )
  FROM bill_lines bl_ord
  JOIN payload p ON p.ord = bl_ord.ord
  WHERE bl.id = bl_ord.id;
END;
$$;

COMMIT;
