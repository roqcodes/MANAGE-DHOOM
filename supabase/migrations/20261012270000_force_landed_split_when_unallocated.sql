-- All-zero line allocations are not a split. Always pro-rata in that case.
-- erp_finish was writing 0 onto lines after create via ELSE 0 / all-zero payload.

BEGIN;

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
      IF public.erp_json_has_numeric_field(v_elem, 'landed_cost_allocated') THEN
        v_sum := v_sum + COALESCE((v_elem ->> 'landed_cost_allocated')::numeric, 0);
        v_with_alloc := v_with_alloc + 1;
      ELSIF public.erp_json_has_numeric_field(v_elem, 'landedCostAllocated') THEN
        v_sum := v_sum + COALESCE((v_elem ->> 'landedCostAllocated')::numeric, 0);
        v_with_alloc := v_with_alloc + 1;
      END IF;
    END IF;
  END LOOP;

  IF v_eligible = 0 OR v_with_alloc <> v_eligible THEN
    RETURN false;
  END IF;

  IF public.erp_round_calc(v_sum) <= 0 THEN
    RETURN false;
  END IF;

  RETURN abs(public.erp_round_calc(v_sum) - public.erp_round_calc(p_landed_total)) < 0.0001;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_prorate_purchase_bill_landed(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_landed_total numeric := 0;
  v_basis_total numeric := 0;
  r record;
  v_alloc numeric;
  v_allocated numeric := 0;
  v_line_no integer := 0;
  v_line_total integer := 0;
BEGIN
  IF p_bill_id IS NULL THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(line_total), 0)
  INTO v_landed_total
  FROM public.erp_purchase_bill_landed_costs
  WHERE purchase_bill_id = p_bill_id;

  SELECT COALESCE(SUM(public.erp_round_calc(quantity * purchase_price)), 0), COUNT(*)::integer
  INTO v_basis_total, v_line_total
  FROM public.erp_purchase_bill_lines
  WHERE purchase_bill_id = p_bill_id
    AND quantity > 0;

  UPDATE public.erp_purchase_bill_lines
  SET landed_cost_allocated = 0,
      unit_loaded_cost = purchase_price
  WHERE purchase_bill_id = p_bill_id;

  IF v_landed_total <= 0 OR v_basis_total <= 0 OR v_line_total = 0 THEN
    RETURN;
  END IF;

  v_allocated := 0;
  v_line_no := 0;
  FOR r IN
    SELECT id, quantity, purchase_price, public.erp_round_calc(quantity * purchase_price) AS ext
    FROM public.erp_purchase_bill_lines
    WHERE purchase_bill_id = p_bill_id AND quantity > 0
    ORDER BY id
  LOOP
    v_line_no := v_line_no + 1;
    IF v_line_no < v_line_total THEN
      v_alloc := public.erp_round_calc(v_landed_total * (r.ext / v_basis_total));
      v_allocated := public.erp_round_calc(v_allocated + v_alloc);
    ELSE
      v_alloc := public.erp_round_calc(v_landed_total - v_allocated);
    END IF;

    UPDATE public.erp_purchase_bill_lines
    SET
      landed_cost_allocated = GREATEST(0, v_alloc),
      unit_loaded_cost = purchase_price + (GREATEST(0, v_alloc) / NULLIF(quantity, 0))
    WHERE id = r.id;
  END LOOP;
END;
$$;

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

  -- Keep only a real split (sum > 0) that already matches. Zeros are not a split.
  IF v_landed_total > 0
     AND v_existing > 0
     AND abs(public.erp_round_calc(v_existing) - public.erp_round_calc(v_landed_total)) < 0.0001 THEN
    UPDATE public.erp_purchase_bill_lines
    SET unit_loaded_cost = purchase_price + (
      GREATEST(0, COALESCE(landed_cost_allocated, 0)) / NULLIF(quantity, 0)
    )
    WHERE purchase_bill_id = p_bill_id;
    RETURN;
  END IF;

  PERFORM public.erp_prorate_purchase_bill_landed(p_bill_id);
END;
$$;

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

  IF public.erp_payload_lines_have_balanced_manual_landed(p_lines, v_landed_total) THEN
    WITH payload AS (
      SELECT value AS elem, ordinality::int AS ord
      FROM jsonb_array_elements(COALESCE(p_lines, '[]'::jsonb)) WITH ORDINALITY
      WHERE COALESCE((value ->> 'quantity')::numeric, 0) > 0
    ),
    payload_ord AS (
      SELECT elem, row_number() OVER (ORDER BY ord) AS ord
      FROM payload
    ),
    bill_lines AS (
      SELECT id, row_number() OVER (ORDER BY id) AS ord
      FROM public.erp_purchase_bill_lines
      WHERE purchase_bill_id = p_bill_id
        AND quantity > 0
    )
    UPDATE public.erp_purchase_bill_lines bl
    SET
      landed_cost_allocated = GREATEST(
        0,
        public.erp_round_calc(
          CASE
            WHEN public.erp_json_has_numeric_field(p.elem, 'landed_cost_allocated')
              THEN COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0)
            WHEN public.erp_json_has_numeric_field(p.elem, 'landedCostAllocated')
              THEN COALESCE((p.elem ->> 'landedCostAllocated')::numeric, 0)
            ELSE 0
          END
        )
      ),
      unit_loaded_cost = bl.purchase_price + (
        GREATEST(
          0,
          CASE
            WHEN public.erp_json_has_numeric_field(p.elem, 'landed_cost_allocated')
              THEN COALESCE((p.elem ->> 'landed_cost_allocated')::numeric, 0)
            WHEN public.erp_json_has_numeric_field(p.elem, 'landedCostAllocated')
              THEN COALESCE((p.elem ->> 'landedCostAllocated')::numeric, 0)
            ELSE 0
          END
        ) / NULLIF(bl.quantity, 0)
      )
    FROM bill_lines bl_ord
    JOIN payload_ord p ON p.ord = bl_ord.ord
    WHERE bl.id = bl_ord.id;

    IF EXISTS (
      SELECT 1
      FROM public.erp_purchase_bill_lines
      WHERE purchase_bill_id = p_bill_id
        AND quantity > 0
      HAVING COALESCE(SUM(landed_cost_allocated), 0) > 0
         AND abs(
           public.erp_round_calc(SUM(landed_cost_allocated))
           - public.erp_round_calc(v_landed_total)
         ) < 0.0001
    ) THEN
      RETURN;
    END IF;
  END IF;

  PERFORM public.erp_prorate_purchase_bill_landed(p_bill_id);
END;
$$;

-- After create, if lines still have 0 allocated and cargo exists, split now.
CREATE OR REPLACE FUNCTION public.erp_create_purchase_bill_from_payload(
  p_payload jsonb,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_vendor_id uuid;
  v_lines jsonb;
  v_landed jsonb;
  v_bill_id uuid;
  v_bill_number text;
  v_finalize boolean;
  v_po_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_vendor_id := NULLIF(p_payload ->> 'vendorId', '')::uuid;
  IF v_vendor_id IS NULL THEN
    RAISE EXCEPTION 'Vendor is required' USING ERRCODE = '22023';
  END IF;

  v_lines := public.erp_purchase_bill_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  v_landed := public.erp_purchase_landed_costs_json_from_payload(p_payload -> 'landedCosts');
  v_finalize := COALESCE((p_payload ->> 'finalize')::boolean, false);
  v_po_id := NULLIF(p_payload ->> 'poId', '')::uuid;

  v_bill_id := public.create_erp_purchase_bill(
    v_vendor_id,
    p_store_id,
    NULLIF(p_payload ->> 'purchaseDate', '')::date,
    NULLIF(p_payload ->> 'dueDate', '')::date,
    v_lines,
    v_landed,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    v_po_id,
    NULLIF(p_payload ->> 'vendorBillNumber', ''),
    NULLIF(p_payload ->> 'grnReference', ''),
    NULLIF(p_payload ->> 'batchReference', ''),
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    NULL,
    NULLIF(p_payload ->> 'expectedDeliveryDate', '')::date,
    false,
    CASE WHEN v_po_id IS NOT NULL THEN false ELSE COALESCE((p_payload ->> 'physicalReceiptOnBill')::boolean, true) END,
    v_uid
  );

  PERFORM public.erp_finish_purchase_bill_landed_allocations(
    v_bill_id,
    COALESCE(p_payload -> 'lines', v_lines)
  );

  IF v_finalize THEN
    PERFORM public.finalize_erp_purchase_bill(v_bill_id, v_uid);
  END IF;

  SELECT purchase_bill_number INTO v_bill_number
  FROM public.erp_purchase_bills
  WHERE id = v_bill_id;

  RETURN jsonb_build_object(
    'billId', v_bill_id,
    'billNumber', v_bill_number,
    'finalized', v_finalize
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_prorate_purchase_bill_landed(uuid) TO authenticated;

COMMIT;
