-- Remove the vegetarian flag from products (food classification no longer used).

BEGIN;

ALTER TABLE public.products DROP COLUMN IF EXISTS is_veg;

COMMIT;
