-- Commercial discounts: DC-* numbers (not VC vendor credits / CN returns).

BEGIN;

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES ('commercial_discount', 'DC', 1, 0)
ON CONFLICT (document_type) DO UPDATE
SET prefix = EXCLUDED.prefix
WHERE public.erp_document_sequences.prefix IS DISTINCT FROM 'DC';

CREATE OR REPLACE FUNCTION public.erp_trg_assign_vendor_credit_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := gen_random_uuid();
  END IF;

  NEW.credit_number := public.erp_format_document_ref(
    CASE WHEN COALESCE(NEW.credit_kind, 'return') = 'discount' THEN 'DC' ELSE 'VC' END,
    NEW.id
  );

  RETURN NEW;
END;
$$;

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

DROP TRIGGER IF EXISTS trg_erp_vendor_credits_document_ref ON public.erp_vendor_credits;
CREATE TRIGGER trg_erp_vendor_credits_document_ref
  BEFORE INSERT ON public.erp_vendor_credits
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_vendor_credit_ref();

DROP TRIGGER IF EXISTS trg_erp_credit_notes_document_ref ON public.erp_credit_notes;
CREATE TRIGGER trg_erp_credit_notes_document_ref
  BEFORE INSERT ON public.erp_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.erp_trg_assign_credit_note_ref();

UPDATE public.erp_vendor_credits
SET credit_number = public.erp_format_document_ref('DC', id)
WHERE COALESCE(credit_kind, 'return') = 'discount'
  AND credit_number ~ '^VC-';

UPDATE public.erp_credit_notes
SET credit_note_number = public.erp_format_document_ref('DC', id)
WHERE COALESCE(credit_kind, 'return') = 'discount'
  AND credit_note_number ~ '^CN-';

COMMIT;
