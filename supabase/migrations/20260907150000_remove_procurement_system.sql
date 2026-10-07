-- Remove procurement planning engine; keep ERP purchasing policy in dedicated table.

BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_purchasing_settings (
  id integer PRIMARY KEY DEFAULT 1,
  over_receive_policy text NOT NULL DEFAULT 'block'
    CHECK (over_receive_policy IN ('block', 'allow_with_authorization', 'allow_with_tolerance')),
  over_receive_tolerance_percent numeric(5, 2) NOT NULL DEFAULT 0,
  posted_bill_shortfall_policy text NOT NULL DEFAULT 'vendor_credit'
    CHECK (posted_bill_shortfall_policy IN ('vendor_credit', 'ignore')),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT erp_purchasing_settings_singleton CHECK (id = 1)
);

INSERT INTO public.erp_purchasing_settings (
  id,
  over_receive_policy,
  over_receive_tolerance_percent,
  posted_bill_shortfall_policy,
  updated_at
)
SELECT
  1,
  COALESCE(ps.over_receive_policy, 'block'),
  COALESCE(ps.over_receive_tolerance_percent, 0),
  COALESCE(ps.posted_bill_shortfall_policy, 'vendor_credit'),
  COALESCE(ps.updated_at, now())
FROM public.procurement_settings ps
WHERE ps.id = 1
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.erp_purchasing_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_purchasing_over_receive_policy()
RETURNS TABLE(policy text, tolerance_percent numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ps.over_receive_policy, 'block'),
    COALESCE(ps.over_receive_tolerance_percent, 0)
  FROM public.erp_purchasing_settings ps
  WHERE ps.id = 1;
$$;

CREATE OR REPLACE FUNCTION public.get_purchase_receive_adjustments(
  p_receive_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_bill_status text;
  v_bill_posted boolean;
  v_policy text;
  v_shortfall jsonb := '[]'::jsonb;
  v_rejected jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT pr.purchase_bill_id INTO v_bill_id
  FROM public.erp_purchase_receives pr
  WHERE pr.id = p_receive_id;

  SELECT posted_bill_shortfall_policy INTO v_policy
  FROM public.erp_purchasing_settings WHERE id = 1;

  IF v_bill_id IS NOT NULL THEN
    SELECT status, accounting_posted
    INTO v_bill_status, v_bill_posted
    FROM public.erp_purchase_bills
    WHERE id = v_bill_id;

    IF v_bill_posted OR v_bill_status IN ('finalized', 'partial', 'paid') THEN
      SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_shortfall
      FROM (
        SELECT
          pbl.id AS bill_line_id,
          prl.variant_id,
          prl.product_name,
          COALESCE(pbl.original_quantity, pbl.quantity) AS billed_qty,
          pbl.accepted_qty,
          GREATEST(0, COALESCE(pbl.original_quantity, pbl.quantity) - COALESCE(pbl.accepted_qty, 0)) AS shortfall_qty,
          pbl.purchase_price,
          pbl.tax_rate_percent,
          ROUND(
            GREATEST(0, COALESCE(pbl.original_quantity, pbl.quantity) - COALESCE(pbl.accepted_qty, 0))
            * pbl.purchase_price * (1 + pbl.tax_rate_percent / 100),
            2
          ) AS credit_amount
        FROM public.erp_purchase_receive_lines prl
        JOIN public.erp_purchase_bill_lines pbl ON pbl.id = prl.bill_line_id
        WHERE prl.purchase_receive_id = p_receive_id
          AND GREATEST(0, COALESCE(pbl.original_quantity, pbl.quantity) - COALESCE(pbl.accepted_qty, 0)) > 0
      ) x;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(x)), '[]'::jsonb) INTO v_rejected
  FROM (
    SELECT
      prl.bill_line_id,
      prl.variant_id,
      prl.product_name,
      prl.rejected_qty,
      prl.purchase_price,
      prl.tax_rate_percent,
      ROUND(prl.rejected_qty * prl.purchase_price * (1 + prl.tax_rate_percent / 100), 2) AS credit_amount
    FROM public.erp_purchase_receive_lines prl
    WHERE prl.purchase_receive_id = p_receive_id
      AND prl.rejected_qty > 0
  ) x;

  RETURN jsonb_build_object(
    'shortfall_policy', COALESCE(v_policy, 'vendor_credit'),
    'bill_posted', COALESCE(v_bill_posted, false),
    'shortfall_lines', v_shortfall,
    'rejected_lines', v_rejected,
    'requires_vendor_credit',
      CASE
        WHEN COALESCE(v_policy, 'vendor_credit') = 'ignore' THEN false
        ELSE jsonb_array_length(v_shortfall) > 0 OR jsonb_array_length(v_rejected) > 0
      END
  );
END;
$$;

DROP TABLE IF EXISTS public.procurement_settings;

COMMIT;
 