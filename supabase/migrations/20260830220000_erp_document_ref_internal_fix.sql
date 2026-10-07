-- Fix: next_erp_document_number must work inside SECURITY DEFINER RPCs and
-- triggers (e.g. expense journal posting) where auth.uid() is NULL.
-- Authorization is enforced by calling RPCs; this helper only formats refs.

BEGIN;

CREATE OR REPLACE FUNCTION public.next_erp_document_number(
  p_document_type text,
  p_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
BEGIN
  SELECT prefix INTO v_prefix
  FROM public.erp_document_sequences
  WHERE document_type = p_document_type;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown document type: %', p_document_type;
  END IF;

  IF p_id IS NOT NULL THEN
    RETURN public.erp_format_document_ref(v_prefix, p_id);
  END IF;

  -- Numbers are assigned by BEFORE INSERT triggers from row id.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.next_erp_document_number(text, uuid) IS
  'Format ERP document ref from type + id. Returns NULL without id so INSERT triggers assign the number.';

COMMIT;
