-- Ensure customer commercial discounts use DC-* (not CN-*) even if an older CN-only trigger was still active.

BEGIN;

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('commercial_discount', 'DC', 1, 0)
ON CONFLICT (document_type) DO UPDATE
SET prefix = EXCLUDED.prefix
WHERE public.erp_document_sequences.prefix IS DISTINCT FROM 'DC';

CREATE OR REPLACE FUNCTION public.erp_trg_assign_credit_note_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.credit_note_number := public.erp_format_document_ref(
    CASE WHEN COALESCE(NEW.credit_kind, 'return') = 'discount' THEN 'DC' ELSE 'CN' END,
    NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_erp_credit_notes_document_ref ON public.erp_credit_notes;
CREATE TRIGGER trg_erp_credit_notes_document_ref
  BEFORE INSERT ON public.erp_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_credit_note_ref();

UPDATE public.erp_credit_notes
SET credit_note_number = public.erp_format_document_ref('DC', id)
WHERE COALESCE(credit_kind, 'return') = 'discount'
  AND credit_note_number IS DISTINCT FROM public.erp_format_document_ref('DC', id);

COMMIT;
