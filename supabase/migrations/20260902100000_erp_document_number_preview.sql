-- Fix document number preview to use UUID-based refs (matches INSERT triggers).

BEGIN;

CREATE OR REPLACE FUNCTION public.peek_erp_document_number(p_document_type text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_id uuid := gen_random_uuid();
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.erp_document_sequences
  WHERE document_type = p_document_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  RETURN public.erp_format_document_ref(v_prefix, v_id);
END;
$$;

COMMENT ON FUNCTION public.peek_erp_document_number(text) IS
  'Preview ERP document ref format e.g. PB-A3F2B (sample UUID). Final number is assigned on save.';

COMMIT;
