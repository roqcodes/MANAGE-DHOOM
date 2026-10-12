-- Calculations: 4 decimal places (erp_round_money_2 retained as alias for compatibility).

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_round_calc(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT round(COALESCE(p_value, 0)::numeric, 4);
$$;

CREATE OR REPLACE FUNCTION public.erp_round_money_2(p_value numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT public.erp_round_calc(p_value);
$$;

CREATE OR REPLACE FUNCTION public.erp_payload_lines_have_balanced_manual_landed(
  p_lines jsonb,
  p_landed_total numeric
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_elem jsonb;
  v_qty numeric;
  v_sum numeric := 0;
  v_eligible integer := 0;
  v_with_alloc integer := 0;
BEGIN
  IF COALESCE(p_landed_total, 0) <= 0 THEN
    RETURN false;
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb))
  LOOP
    v_qty := COALESCE((v_elem ->> 'quantity')::numeric, 0);
    IF v_qty > 0 THEN
      v_eligible := v_eligible + 1;
      IF v_elem ? 'landed_cost_allocated' THEN
        v_sum := v_sum + COALESCE((v_elem ->> 'landed_cost_allocated')::numeric, 0);
        v_with_alloc := v_with_alloc + 1;
      ELSIF v_elem ? 'landedCostAllocated' THEN
        v_sum := v_sum + COALESCE((v_elem ->> 'landedCostAllocated')::numeric, 0);
        v_with_alloc := v_with_alloc + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_eligible = 0 OR v_with_alloc <> v_eligible THEN
    RETURN false;
  END IF;

  RETURN abs(public.erp_round_calc(v_sum) - public.erp_round_calc(p_landed_total)) < 0.0001;
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_round_calc(numeric) TO authenticated;

COMMIT;
