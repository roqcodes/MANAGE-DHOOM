-- vat_return / vat_payment were seeded with empty prefix; erp_next_document_ref rejects those.

BEGIN;

INSERT INTO public.erp_document_sequences (document_type, prefix, next_number, padding)
VALUES
  ('vat_return', 'VR', 1, 0),
  ('vat_payment', 'VP', 1, 0)
ON CONFLICT (document_type) DO UPDATE
SET prefix = EXCLUDED.prefix
WHERE public.erp_document_sequences.prefix IS NULL
   OR BTRIM(public.erp_document_sequences.prefix) = '';

COMMIT;
