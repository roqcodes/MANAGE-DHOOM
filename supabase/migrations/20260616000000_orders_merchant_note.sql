-- Customer note for merchant on each order (optional, set at checkout)
BEGIN;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS merchant_note text;

COMMENT ON COLUMN public.orders.merchant_note IS 'Optional note from customer to merchant at checkout';

COMMIT;
r