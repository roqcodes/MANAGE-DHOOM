-- Resolve RPC ambiguity: two create_erp_vat_return overloads existed after phase7 added p_notes.
-- Keep the 5-arg version (with optional notes); drop the legacy 4-arg signature.

BEGIN;

-- Ensure document-type prefixes exist (empty prefix causes "Unknown document type").
INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES
  ('vat_return', 'VR', 1, 0),
  ('vat_payment', 'VP', 1, 0)
ON CONFLICT (document_type) DO UPDATE
SET prefix = EXCLUDED.prefix
WHERE public.erp_document_sequences.prefix IS NULL
   OR BTRIM(public.erp_document_sequences.prefix) = '';

DROP FUNCTION IF EXISTS public.create_erp_vat_return(uuid, date, date, uuid);

CREATE OR REPLACE FUNCTION public.create_erp_vat_return(
  p_store_id uuid,
  p_period_start date,
  p_period_end date,
  p_notes text DEFAULT NULL,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_number text;
  v_output numeric := 0;
  v_input numeric := 0;
  v_label text;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_period_end < p_period_start THEN
    RAISE EXCEPTION 'Invalid period';
  END IF;

  SELECT t.out_id, t.out_ref INTO v_id, v_number
  FROM public.erp_next_document_ref('vat_return') AS t;

  v_label := to_char(p_period_start, 'Mon - YYYY');

  SELECT COALESCE(SUM(gst_amount), 0) INTO v_output
  FROM public.invoices
  WHERE status IN ('issued', 'partial', 'paid')
    AND created_at::date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  SELECT COALESCE(SUM(tax_amount), 0) INTO v_input
  FROM public.erp_purchase_bills
  WHERE status IN ('finalized', 'partial', 'paid')
    AND purchase_date BETWEEN p_period_start AND p_period_end
    AND (p_store_id IS NULL OR store_id = p_store_id);

  INSERT INTO public.erp_vat_returns (
    id, return_number, period_start, period_end, period_label, store_id,
    output_tax, input_tax, total_tax_payable, balance_due, notes, created_by
  )
  VALUES (
    v_id, v_number, p_period_start, p_period_end, v_label, p_store_id,
    v_output, v_input, GREATEST(0, v_output - v_input), GREATEST(0, v_output - v_input),
    COALESCE(p_notes, ''), p_created_by
  );

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_erp_vat_return(uuid, date, date, text, uuid) TO authenticated;

COMMIT;
