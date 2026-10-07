-- Remove stale create_erp_purchase_bill overload (pre expected_delivery_date param).
-- PostgreSQL keeps both when a new parameter is inserted mid-signature.

BEGIN;

DROP FUNCTION IF EXISTS public.create_erp_purchase_bill(
  uuid,
  uuid,
  date,
  date,
  jsonb,
  jsonb,
  numeric,
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  boolean,
  uuid
);

COMMIT;
