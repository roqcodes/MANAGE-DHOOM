-- Persist sales order tax settings for accurate invoice conversion.

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tax_inclusive boolean NOT NULL DEFAULT true;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS tax_rate_percent numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.tax_inclusive IS
  'Whether line unit prices on ERP sales orders include tax.';

COMMENT ON COLUMN public.order_items.tax_rate_percent IS
  'Tax rate captured at sales order line creation (percent).';

COMMIT;
