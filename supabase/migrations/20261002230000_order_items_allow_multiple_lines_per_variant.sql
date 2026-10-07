-- POS may record multiple order_items for the same variant at different cashier prices.
-- Online checkout still aggregates by variant in place_customer_order (GROUP BY variant_id).

BEGIN;

DROP INDEX IF EXISTS public.order_items_order_variant_uidx;

COMMIT;
