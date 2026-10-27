-- Pin Sales-by-Item / recognized COGS to invoice_items.base_price when it is a
-- positive sale-time cost, even if that cost equals the selling unit_price.
--
-- INV-9C026 / QA-NEG-STOCK-001: sale at zero stock used catalog/SPI ₹10 (journal
-- Dr COGS 50 / Cr STOCK 50). Later receipts moved remaining WAC to ₹16.25.
-- Reports then ignored base_price because it equalled unit_price and used live
-- WAC → COGS ₹81.25. P&L stayed on posted GL. Do not rewrite historical journals.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_invoice_item_margin_components(
  p_base_price numeric,
  p_unit_price numeric,
  p_variant_id uuid,
  p_product_id uuid,
  p_store_id uuid,
  p_quantity numeric,
  p_pending_cost_qty numeric,
  p_taxable_amount numeric,
  p_discount_allocated numeric DEFAULT 0
)
RETURNS TABLE (
  line_cogs numeric,
  uncosted_revenue numeric,
  recognized_profit numeric,
  net_revenue_ex_tax numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_qty numeric := GREATEST(COALESCE(p_quantity, 0), 0);
  v_pending numeric := GREATEST(COALESCE(p_pending_cost_qty, 0), 0);
  v_costed_qty numeric;
  v_unit_cost numeric;
  v_taxable numeric := COALESCE(p_taxable_amount, 0);
  v_discount numeric := GREATEST(0, COALESCE(p_discount_allocated, 0));
  v_net_revenue numeric;
  v_cogs numeric;
  v_uncosted numeric;
BEGIN
  IF v_qty <= 0 THEN
    line_cogs := 0;
    uncosted_revenue := 0;
    recognized_profit := 0;
    net_revenue_ex_tax := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_pending := LEAST(v_pending, v_qty);
  v_costed_qty := v_qty - v_pending;
  v_net_revenue := GREATEST(0, v_taxable - v_discount);

  IF v_pending >= v_qty THEN
    v_unit_cost := 0;
  ELSIF COALESCE(p_base_price, 0) > 0 THEN
    v_unit_cost := p_base_price;
  ELSE
    v_unit_cost := public.erp_invoice_line_unit_cost(
      p_base_price,
      p_unit_price,
      p_variant_id,
      p_product_id,
      p_store_id
    );
  END IF;

  v_cogs := ROUND(COALESCE(v_unit_cost, 0) * v_costed_qty, 2);
  v_uncosted := ROUND(v_net_revenue * (v_pending / v_qty), 2);

  line_cogs := v_cogs;
  uncosted_revenue := v_uncosted;
  net_revenue_ex_tax := ROUND(v_net_revenue, 2);
  recognized_profit := ROUND(v_net_revenue - v_cogs - v_uncosted, 2);
  RETURN NEXT;
END;
$$;

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
