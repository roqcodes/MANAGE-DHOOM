-- net_acquisition_discount_policy added a 9-arg erp_invoice_item_margin_components (9th defaults to 0).
-- The original 8-arg overload remained, so 8-arg calls in sales reports became ambiguous.

BEGIN;

DROP FUNCTION IF EXISTS public.erp_invoice_item_margin_components(
  numeric,
  numeric,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric
);

GRANT EXECUTE ON FUNCTION public.erp_invoice_item_margin_components(
  numeric,
  numeric,
  uuid,
  uuid,
  uuid,
  numeric,
  numeric,
  numeric,
  numeric
) TO authenticated;

COMMIT;
