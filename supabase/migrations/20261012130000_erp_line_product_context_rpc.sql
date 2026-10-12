-- Fast per-product line context (purchase rate prefill + details panel).
-- Replaces scanning all bill/invoice lines in application code.

CREATE INDEX IF NOT EXISTS idx_erp_purchase_bill_lines_product_bill
  ON public.erp_purchase_bill_lines (product_id, purchase_bill_id);

CREATE INDEX IF NOT EXISTS idx_erp_purchase_bills_store_status_dates
  ON public.erp_purchase_bills (store_id, status, purchase_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_invoice_items_product_invoice
  ON public.invoice_items (product_id, invoice_id);

CREATE OR REPLACE FUNCTION public.erp_line_product_context(
  p_store_id uuid,
  p_product_ids uuid[],
  p_vendor_id uuid DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  on_hand_stock numeric,
  catalog_purchase_price numeric,
  tax_rate_percent numeric,
  store_sales_price numeric,
  avg_purchase_price numeric,
  last_purchase_price numeric,
  last_bill_purchase_rate numeric,
  vendor_last_bill_purchase_rate numeric,
  counterparty_last_price numeric,
  last_selling_price numeric,
  avg_selling_price numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT unnest(p_product_ids) AS product_id
  ),
  base AS (
    SELECT
      i.product_id,
      COALESCE(spi.stock, 0)::numeric AS on_hand_stock,
      p.purchase_price AS catalog_purchase_price,
      p.tax_rate_percent,
      COALESCE(spi.sales_price, p.price) AS store_sales_price,
      spi.purchase_price AS avg_purchase_price
    FROM ids i
    LEFT JOIN public.products p ON p.id = i.product_id
    LEFT JOIN public.store_product_inventory spi
      ON spi.product_id = i.product_id
     AND spi.store_id = p_store_id
  ),
  last_purchase AS (
    SELECT DISTINCT ON (pbl.product_id)
      pbl.product_id,
      CASE
        WHEN COALESCE(pbl.unit_loaded_cost, 0) > 0 THEN pbl.unit_loaded_cost
        ELSE pbl.purchase_price
      END AS last_loaded,
      pbl.purchase_price AS bill_rate
    FROM public.erp_purchase_bill_lines pbl
    INNER JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
    WHERE pb.store_id = p_store_id
      AND pb.status IS DISTINCT FROM 'cancelled'
      AND pbl.product_id = ANY (p_product_ids)
    ORDER BY
      pbl.product_id,
      pb.purchase_date DESC NULLS LAST,
      pb.created_at DESC
  ),
  vendor_purchase AS (
    SELECT DISTINCT ON (pbl.product_id)
      pbl.product_id,
      CASE
        WHEN COALESCE(pbl.unit_loaded_cost, 0) > 0 THEN pbl.unit_loaded_cost
        ELSE pbl.purchase_price
      END AS vendor_loaded,
      pbl.purchase_price AS vendor_bill_rate
    FROM public.erp_purchase_bill_lines pbl
    INNER JOIN public.erp_purchase_bills pb ON pb.id = pbl.purchase_bill_id
    WHERE p_vendor_id IS NOT NULL
      AND pb.store_id = p_store_id
      AND pb.vendor_id = p_vendor_id
      AND pb.status IS DISTINCT FROM 'cancelled'
      AND pbl.product_id = ANY (p_product_ids)
    ORDER BY
      pbl.product_id,
      pb.purchase_date DESC NULLS LAST,
      pb.created_at DESC
  ),
  sales_agg AS (
    SELECT
      ii.product_id,
      SUM(ii.quantity * ii.unit_price) / NULLIF(SUM(ii.quantity), 0) AS avg_unit,
      MAX(i.created_at) AS max_at
    FROM public.invoice_items ii
    INNER JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND i.status IS DISTINCT FROM 'cancelled'
      AND ii.product_id = ANY (p_product_ids)
    GROUP BY ii.product_id
  ),
  last_sale AS (
    SELECT DISTINCT ON (ii.product_id)
      ii.product_id,
      ii.unit_price AS last_unit
    FROM public.invoice_items ii
    INNER JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND i.status IS DISTINCT FROM 'cancelled'
      AND ii.product_id = ANY (p_product_ids)
    ORDER BY ii.product_id, i.created_at DESC
  ),
  customer_sale AS (
    SELECT DISTINCT ON (ii.product_id)
      ii.product_id,
      ii.unit_price AS customer_unit
    FROM public.invoice_items ii
    INNER JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE p_customer_id IS NOT NULL
      AND i.store_id = p_store_id
      AND i.user_id = p_customer_id
      AND i.status IS DISTINCT FROM 'cancelled'
      AND ii.product_id = ANY (p_product_ids)
    ORDER BY ii.product_id, i.created_at DESC
  )
  SELECT
    b.product_id,
    b.on_hand_stock,
    b.catalog_purchase_price,
    b.tax_rate_percent,
    b.store_sales_price,
    b.avg_purchase_price,
    lp.last_loaded AS last_purchase_price,
    lp.bill_rate AS last_bill_purchase_rate,
    vp.vendor_bill_rate AS vendor_last_bill_purchase_rate,
    CASE
      WHEN p_customer_id IS NOT NULL THEN cs.customer_unit
      WHEN p_vendor_id IS NOT NULL THEN vp.vendor_loaded
      ELSE NULL
    END AS counterparty_last_price,
    ls.last_unit AS last_selling_price,
    sa.avg_unit AS avg_selling_price
  FROM base b
  LEFT JOIN last_purchase lp ON lp.product_id = b.product_id
  LEFT JOIN vendor_purchase vp ON vp.product_id = b.product_id
  LEFT JOIN sales_agg sa ON sa.product_id = b.product_id
  LEFT JOIN last_sale ls ON ls.product_id = b.product_id
  LEFT JOIN customer_sale cs ON cs.product_id = b.product_id;
$$;

GRANT EXECUTE ON FUNCTION public.erp_line_product_context(uuid, uuid[], uuid, uuid) TO authenticated;
