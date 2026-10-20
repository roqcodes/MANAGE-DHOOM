-- Uncosted / negative-stock sales: track pending line cost, backfill from purchase receipts (FIFO
-- by invoice date), and report recognized profit separately from uncosted revenue.
-- Inventory valuation remains store-level weighted average (AVCO) on receipt; no sale-time COGS GL.

BEGIN;

ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS pending_cost_qty numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.invoice_items.pending_cost_qty IS
  'Units on this line still awaiting a defensible unit cost (negative-stock / zero cost at sale).';

-- ─── Cost resolution (store WAC → catalog) ─────────────────────────────────

DROP FUNCTION IF EXISTS public.erp_resolve_invoice_line_cost(numeric, uuid, uuid);
DROP FUNCTION IF EXISTS public.erp_invoice_line_unit_cost(numeric, numeric, uuid, uuid);

CREATE OR REPLACE FUNCTION public.erp_resolve_invoice_line_cost(
  p_purchase_price numeric,
  p_variant_id uuid,
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(p_purchase_price, 0),
    (
      SELECT spi.purchase_price
      FROM public.store_product_inventory spi
      WHERE p_store_id IS NOT NULL
        AND spi.store_id = p_store_id
        AND spi.product_id = COALESCE(
          p_product_id,
          (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = p_variant_id)
        )
        AND COALESCE(spi.purchase_price, 0) > 0
    ),
    (
      SELECT pv.purchase_price
      FROM public.product_variants pv
      WHERE pv.id = p_variant_id
        AND COALESCE(pv.purchase_price, 0) > 0
    ),
    (
      SELECT p.purchase_price
      FROM public.products p
      WHERE p.id = COALESCE(
        p_product_id,
        (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = p_variant_id)
      )
        AND COALESCE(p.purchase_price, 0) > 0
    ),
    0::numeric
  );
$$;

CREATE OR REPLACE FUNCTION public.erp_invoice_line_unit_cost(
  p_stored_base_price numeric,
  p_unit_price numeric,
  p_variant_id uuid,
  p_product_id uuid,
  p_store_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(
      CASE
        WHEN p_stored_base_price IS NOT NULL
          AND p_stored_base_price > 0
          AND (
            p_unit_price IS NULL
            OR abs(p_stored_base_price - p_unit_price) > 0.0001
          )
        THEN p_stored_base_price
      END,
      0::numeric
    ),
    public.erp_resolve_invoice_line_cost(0, p_variant_id, p_product_id, p_store_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.erp_invoice_item_margin_components(
  p_base_price numeric,
  p_unit_price numeric,
  p_variant_id uuid,
  p_product_id uuid,
  p_store_id uuid,
  p_quantity numeric,
  p_pending_cost_qty numeric,
  p_taxable_amount numeric
)
RETURNS TABLE (
  line_cogs numeric,
  uncosted_revenue numeric,
  recognized_profit numeric
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
  v_cogs numeric;
  v_uncosted numeric;
BEGIN
  IF v_qty <= 0 THEN
    line_cogs := 0;
    uncosted_revenue := 0;
    recognized_profit := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  v_pending := LEAST(v_pending, v_qty);
  v_costed_qty := v_qty - v_pending;

  IF v_pending >= v_qty THEN
    v_unit_cost := 0;
  ELSIF COALESCE(p_base_price, 0) > 0
    AND (
      p_unit_price IS NULL
      OR abs(p_base_price - p_unit_price) > 0.0001
    )
  THEN
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
  v_uncosted := ROUND(v_taxable * (v_pending / v_qty), 2);

  line_cogs := v_cogs;
  uncosted_revenue := v_uncosted;
  recognized_profit := ROUND(v_taxable - v_cogs - v_uncosted, 2);
  RETURN NEXT;
END;
$$;

-- FIFO allocation of receipt unit cost to pending sale lines (same store + product).
CREATE OR REPLACE FUNCTION public.erp_allocate_receipt_cost_to_pending_sales(
  p_store_id uuid,
  p_product_id uuid,
  p_receipt_qty numeric,
  p_unit_cost numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining numeric;
  v_pending_total numeric;
  r record;
  v_alloc numeric;
BEGIN
  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RETURN;
  END IF;
  IF COALESCE(p_receipt_qty, 0) <= 0 OR COALESCE(p_unit_cost, 0) < 0 THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(ii.pending_cost_qty), 0)
  INTO v_pending_total
  FROM public.invoice_items ii
  INNER JOIN public.invoices i ON i.id = ii.invoice_id
  WHERE i.store_id = p_store_id
    AND ii.product_id = p_product_id
    AND i.status NOT IN ('cancelled', 'pending', 'draft')
    AND COALESCE(ii.pending_cost_qty, 0) > 0;

  IF COALESCE(v_pending_total, 0) <= 0 THEN
    RETURN;
  END IF;

  v_remaining := LEAST(p_receipt_qty, v_pending_total);

  FOR r IN
    SELECT
      ii.id,
      ii.pending_cost_qty
    FROM public.invoice_items ii
    INNER JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE i.store_id = p_store_id
      AND ii.product_id = p_product_id
      AND i.status NOT IN ('cancelled', 'pending', 'draft')
      AND COALESCE(ii.pending_cost_qty, 0) > 0
    ORDER BY COALESCE(i.issued_at, i.created_at), i.id, ii.id
    FOR UPDATE OF ii
  LOOP
    IF v_remaining <= 0 THEN
      EXIT;
    END IF;

    v_alloc := LEAST(r.pending_cost_qty, v_remaining);
    IF v_alloc <= 0 THEN
      CONTINUE;
    END IF;

    UPDATE public.invoice_items
    SET
      base_price = ROUND(p_unit_cost, 4),
      pending_cost_qty = pending_cost_qty - v_alloc
    WHERE id = r.id;

    v_remaining := v_remaining - v_alloc;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_product_inventory_apply_receipt_cost(
  p_store_id uuid,
  p_product_id uuid,
  p_qty numeric,
  p_unit_cost numeric,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock numeric;
  v_cost numeric;
  v_new_stock numeric;
  v_new_cost numeric;
BEGIN
  IF NOT public.is_staff_user(p_user_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_user_id);

  IF p_store_id IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION 'Store and product are required';
  END IF;

  IF p_qty = 0 THEN
    RETURN NULL;
  END IF;

  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Unit cost must be zero or positive';
  END IF;

  SELECT stock, purchase_price
  INTO v_stock, v_cost
  FROM public.store_product_inventory
  WHERE store_id = p_store_id AND product_id = p_product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF p_qty < 0 THEN
      RAISE EXCEPTION 'Insufficient stock: no inventory for product % at store %', p_product_id, p_store_id;
    END IF;
    INSERT INTO public.store_product_inventory (store_id, product_id, stock, purchase_price, updated_at)
    VALUES (p_store_id, p_product_id, p_qty, ROUND(p_unit_cost, 4), now());
    PERFORM public.erp_allocate_receipt_cost_to_pending_sales(
      p_store_id, p_product_id, p_qty, p_unit_cost
    );
    RETURN ROUND(p_unit_cost, 4);
  END IF;

  v_new_stock := COALESCE(v_stock, 0) + p_qty;
  IF v_new_stock < 0 THEN
    RAISE EXCEPTION 'Insufficient stock: product % at store %', p_product_id, p_store_id;
  END IF;

  IF p_qty > 0 THEN
    IF COALESCE(v_stock, 0) <= 0 OR v_cost IS NULL THEN
      v_new_cost := p_unit_cost;
    ELSE
      v_new_cost := (COALESCE(v_stock, 0) * COALESCE(v_cost, 0) + p_qty * p_unit_cost)
        / NULLIF(COALESCE(v_stock, 0) + p_qty, 0);
    END IF;
    v_new_cost := ROUND(v_new_cost, 4);
  ELSE
    v_new_cost := v_cost;
    IF v_new_stock = 0 THEN
      v_new_cost := NULL;
    END IF;
  END IF;

  UPDATE public.store_product_inventory
  SET stock = v_new_stock, purchase_price = v_new_cost, updated_at = now()
  WHERE store_id = p_store_id AND product_id = p_product_id;

  IF p_qty > 0 THEN
    PERFORM public.erp_allocate_receipt_cost_to_pending_sales(
      p_store_id, p_product_id, p_qty, p_unit_cost
    );
  END IF;

  RETURN v_new_cost;
END;
$$;

-- Mark historical lines with zero resolved cost as pending (idempotent).
UPDATE public.invoice_items ii
SET pending_cost_qty = ii.quantity
FROM public.invoices i
WHERE i.id = ii.invoice_id
  AND i.status NOT IN ('cancelled', 'pending', 'draft')
  AND ii.quantity > 0
  AND COALESCE(ii.pending_cost_qty, 0) = 0
  AND public.erp_invoice_line_unit_cost(
    ii.base_price,
    ii.unit_price,
    ii.variant_id,
    ii.product_id,
    i.store_id
  ) <= 0;

-- ─── Sales reports (recognized profit vs uncosted revenue) ─────────────────

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_customer(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.sales_with_tax DESC), '[]'::jsonb)
    FROM (
      SELECT
        u.id AS customer_id,
        u.name AS customer_name,
        i.source AS channel,
        COUNT(DISTINCT i.id) AS invoice_count,
        ROUND(COALESCE(SUM(i.total_amount), 0), 2) AS sales_with_tax,
        ROUND(COALESCE(SUM(i.discount), 0), 2) AS total_discount,
        ROUND(COALESCE(SUM(i.gst_amount), 0), 2) AS tax,
        ROUND(COALESCE(SUM(i.subtotal), 0), 2) AS net_sales_value,
        ROUND(COALESCE(SUM(m.line_cogs), 0), 2) AS purchase_cost,
        ROUND(COALESCE(SUM(m.uncosted_revenue), 0), 2) AS uncosted_revenue,
        ROUND(COALESCE(SUM(m.recognized_profit), 0), 2) AS net_profit,
        ROUND(
          CASE
            WHEN COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(m.uncosted_revenue), 0) > 0 THEN
              100.0 * COALESCE(SUM(m.recognized_profit), 0)
              / (COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(m.uncosted_revenue), 0))
            ELSE 0
          END,
          3
        ) AS profit_percent,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS balance_due
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
      LEFT JOIN LATERAL (
        SELECT
          SUM(mc.line_cogs) AS line_cogs,
          SUM(mc.uncosted_revenue) AS uncosted_revenue,
          SUM(mc.recognized_profit) AS recognized_profit
        FROM public.invoice_items ii
        CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
          ii.base_price,
          ii.unit_price,
          ii.variant_id,
          ii.product_id,
          i.store_id,
          ii.quantity,
          ii.pending_cost_qty,
          COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
        ) mc
        WHERE ii.invoice_id = i.id
      ) m ON true
      WHERE i.status NOT IN ('cancelled', 'pending')
        AND i.created_at::date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY u.id, u.name, i.source
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_item(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_amount DESC), '[]'::jsonb)
    FROM (
      SELECT
        ii.product_name,
        ii.variant_id,
        i.source AS channel,
        ROUND(COALESCE(SUM(ii.quantity), 0), 2) AS total_qty,
        ROUND(COALESCE(SUM(ii.total_amount), 0), 2) AS total_amount,
        ROUND(COALESCE(SUM(ii.gst_amount), 0), 2) AS total_tax,
        ROUND(COALESCE(SUM(mc.line_cogs), 0), 2) AS purchase_cost,
        ROUND(COALESCE(SUM(mc.uncosted_revenue), 0), 2) AS uncosted_revenue,
        ROUND(COALESCE(SUM(mc.recognized_profit), 0), 2) AS profit
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
        ii.base_price,
        ii.unit_price,
        ii.variant_id,
        ii.product_id,
        i.store_id,
        ii.quantity,
        ii.pending_cost_qty,
        COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
      ) mc
      WHERE i.status NOT IN ('cancelled', 'pending')
        AND i.created_at::date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          p_channel = 'all'
          OR (p_channel = 'erp' AND i.source = 'erp')
          OR (p_channel = 'online' AND i.source <> 'erp')
        )
      GROUP BY ii.product_name, ii.variant_id, i.source
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_sales_by_salesman(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_channel text DEFAULT 'all'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.total_sales DESC), '[]'::jsonb)
    FROM (
      WITH invoice_stats AS (
        SELECT
          i.sales_person_id,
          COUNT(*) AS invoice_count,
          SUM(i.total_amount) AS total_sales,
          SUM(i.subtotal) AS total_sales_without_tax,
          SUM(m.line_cogs) AS purchase_cost,
          SUM(m.uncosted_revenue) AS uncosted_revenue,
          SUM(m.recognized_profit) AS recognized_profit
        FROM public.invoices i
        LEFT JOIN LATERAL (
          SELECT
            SUM(mc.line_cogs) AS line_cogs,
            SUM(mc.uncosted_revenue) AS uncosted_revenue,
            SUM(mc.recognized_profit) AS recognized_profit
          FROM public.invoice_items ii
          CROSS JOIN LATERAL public.erp_invoice_item_margin_components(
            ii.base_price,
            ii.unit_price,
            ii.variant_id,
            ii.product_id,
            i.store_id,
            ii.quantity,
            ii.pending_cost_qty,
            COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount)
          ) mc
          WHERE ii.invoice_id = i.id
        ) m ON true
        WHERE i.status NOT IN ('cancelled', 'pending')
          AND i.created_at::date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY i.sales_person_id
      ),
      credit_stats AS (
        SELECT
          i.sales_person_id,
          COUNT(cn.id) AS credit_note_count,
          SUM(cn.total_amount) AS credit_note_total
        FROM public.erp_credit_notes cn
        JOIN public.invoices i ON i.id = cn.source_invoice_id
        WHERE cn.status <> 'cancelled'
          AND cn.credit_note_date BETWEEN p_date_from AND p_date_to
          AND (p_store_id IS NULL OR cn.store_id = p_store_id)
          AND (
            p_channel = 'all'
            OR (p_channel = 'erp' AND i.source = 'erp')
            OR (p_channel = 'online' AND i.source <> 'erp')
          )
        GROUP BY i.sales_person_id
      ),
      combined AS (
        SELECT sales_person_id FROM invoice_stats
        UNION
        SELECT sales_person_id FROM credit_stats
      )
      SELECT
        COALESCE(sp.id, '00000000-0000-0000-0000-000000000000'::uuid) AS salesman_id,
        COALESCE(sp.name, 'Unassigned') AS salesman_name,
        COALESCE(inv.invoice_count, 0) AS invoice_count,
        ROUND(COALESCE(inv.total_sales, 0), 2) AS total_sales,
        ROUND(COALESCE(inv.total_sales_without_tax, 0), 2) AS total_sales_without_tax,
        COALESCE(cn.credit_note_count, 0) AS credit_note_count,
        ROUND(COALESCE(cn.credit_note_total, 0), 2) AS credit_note_total,
        ROUND(COALESCE(inv.purchase_cost, 0), 2) AS purchase_cost,
        ROUND(COALESCE(inv.uncosted_revenue, 0), 2) AS uncosted_revenue,
        ROUND(
          COALESCE(inv.recognized_profit, 0) - COALESCE(cn.credit_note_total, 0),
          2
        ) AS profit,
        ROUND(
          CASE
            WHEN COALESCE(inv.total_sales_without_tax, 0) - COALESCE(inv.uncosted_revenue, 0) > 0 THEN
              100.0 * (
                COALESCE(inv.recognized_profit, 0) - COALESCE(cn.credit_note_total, 0)
              ) / (COALESCE(inv.total_sales_without_tax, 0) - COALESCE(inv.uncosted_revenue, 0))
            ELSE 0
          END,
          3
        ) AS profit_percent
      FROM combined c
      LEFT JOIN invoice_stats inv ON inv.sales_person_id IS NOT DISTINCT FROM c.sales_person_id
      LEFT JOIN credit_stats cn ON cn.sales_person_id IS NOT DISTINCT FROM c.sales_person_id
      LEFT JOIN public.users sp ON sp.id = c.sales_person_id
    ) r
  );
END;
$$;

-- create_erp_invoice / update_erp_invoice: store-aware cost + pending_cost_qty (from 20261019240000).

CREATE OR REPLACE FUNCTION public.create_erp_invoice(
  p_user_id uuid,
  p_store_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sales_person_id uuid DEFAULT NULL,
  p_estimate_id uuid DEFAULT NULL,
  p_finalize boolean DEFAULT true,
  p_created_by uuid DEFAULT auth.uid()
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_number text;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_variant_id uuid;
  v_product_id uuid;
  v_line_cost numeric;
  v_pending_qty numeric;
BEGIN
  IF NOT public.is_staff_user(p_created_by) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_user_id IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'Customer and store are required';
  END IF;

  PERFORM public.require_store_access(p_store_id, p_created_by);

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  IF COALESCE(p_finalize, true) THEN
    PERFORM public.assert_erp_sales_lines_store_stock(p_store_id, p_lines, p_created_by);
  END IF;

  SELECT t.out_id, t.out_ref INTO v_invoice_id, v_invoice_number
  FROM public.erp_next_document_ref('sales_invoice') AS t;

  IF v_invoice_id IS NULL OR v_invoice_number IS NULL OR BTRIM(v_invoice_number) = '' THEN
    RAISE EXCEPTION 'Could not allocate invoice number';
  END IF;

  INSERT INTO public.invoices (
    id, order_id, user_id, invoice_number, subtotal, gst_amount, total_amount,
    status, created_at, due_date, issued_at, store_id, amount_paid,
    credits_applied, balance_due, discount, source, sales_person_id,
    reference, tax_inclusive, estimate_id, notes, inventory_committed
  )
  VALUES (
    v_invoice_id, NULL, p_user_id, v_invoice_number, 0, 0, 0,
    'pending', now(), p_due_date, CASE WHEN p_finalize THEN now() ELSE NULL END,
    p_store_id, 0, 0, 0, COALESCE(p_discount, 0), 'erp',
    p_sales_person_id, p_reference, COALESCE(p_tax_inclusive, false),
    p_estimate_id, p_notes, false
  );

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_product_id := COALESCE(
      NULLIF(v_line ->> 'product_id', '')::uuid,
      (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = v_variant_id)
    );
    v_line_cost := public.erp_resolve_invoice_line_cost(
      (v_line ->> 'purchase_price')::numeric,
      v_variant_id,
      v_product_id,
      p_store_id
    );
    v_pending_qty := CASE WHEN COALESCE(v_line_cost, 0) > 0 THEN 0 ELSE v_qty END;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount, pending_cost_qty
    )
    VALUES (
      v_invoice_id,
      v_variant_id,
      v_product_id,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      v_line_cost,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      NULLIF(v_line ->> 'unit_id', '')::uuid,
      v_line ->> 'description',
      v_taxable,
      v_pending_qty
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  PERFORM public.assert_customer_credit_headroom(p_user_id, v_total, NULL);

  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    status = CASE WHEN p_finalize THEN 'issued' ELSE 'pending' END
  WHERE id = v_invoice_id;

  IF p_finalize THEN
    PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
  END IF;

  IF p_estimate_id IS NOT NULL THEN
    UPDATE public.erp_estimates
    SET status = 'converted', converted_invoice_id = v_invoice_id, updated_at = now()
    WHERE id = p_estimate_id;
  END IF;

  RETURN v_invoice_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_erp_invoice(
  p_invoice_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_lines jsonb,
  p_discount numeric DEFAULT 0,
  p_tax_inclusive boolean DEFAULT false,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_paid numeric;
  v_credits numeric;
  v_store_id uuid;
  v_user_id uuid;
  v_line jsonb;
  v_subtotal numeric := 0;
  v_tax numeric := 0;
  v_total numeric := 0;
  v_qty numeric;
  v_unit_price numeric;
  v_tax_rate numeric;
  v_line_tax numeric;
  v_line_total numeric;
  v_taxable numeric;
  v_will_issue boolean;
  v_variant_id uuid;
  v_product_id uuid;
  v_line_cost numeric;
  v_pending_qty numeric;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required';
  END IF;

  SELECT status, store_id, user_id
  INTO v_status, v_store_id, v_user_id
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot edit a cancelled invoice';
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations
  WHERE invoice_id = p_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications
  WHERE invoice_id = p_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot edit invoice after payments or credit notes';
  END IF;

  v_will_issue := v_status IN ('pending', 'draft');

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, 1);
  PERFORM public.void_journals_for_entity('invoice', p_invoice_id);

  DELETE FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  IF v_will_issue OR v_status = 'issued' THEN
    PERFORM public.assert_erp_sales_lines_store_stock(v_store_id, p_lines, p_actor);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines)
  LOOP
    v_qty := COALESCE((v_line ->> 'quantity')::numeric, 0);
    v_unit_price := COALESCE((v_line ->> 'unit_price')::numeric, 0);
    v_tax_rate := COALESCE((v_line ->> 'tax_rate_percent')::numeric, 0);
    v_variant_id := NULLIF(v_line ->> 'variant_id', '')::uuid;
    v_product_id := COALESCE(
      NULLIF(v_line ->> 'product_id', '')::uuid,
      (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = v_variant_id)
    );
    v_line_cost := public.erp_resolve_invoice_line_cost(
      (v_line ->> 'purchase_price')::numeric,
      v_variant_id,
      v_product_id,
      v_store_id
    );
    v_pending_qty := CASE WHEN COALESCE(v_line_cost, 0) > 0 THEN 0 ELSE v_qty END;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;

    IF p_tax_inclusive THEN
      v_taxable := ROUND(v_unit_price * v_qty / (1 + v_tax_rate / 100), 2);
      v_line_tax := ROUND(v_unit_price * v_qty - v_taxable, 2);
      v_line_total := ROUND(v_unit_price * v_qty, 2);
    ELSE
      v_taxable := ROUND(v_unit_price * v_qty, 2);
      v_line_tax := ROUND(v_taxable * v_tax_rate / 100, 2);
      v_line_total := v_taxable + v_line_tax;
    END IF;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_id, product_name, quantity, unit_price,
      base_price, gst_rate, gst_amount, total_amount, vendor_id,
      unit_id, description, taxable_amount, pending_cost_qty
    )
    VALUES (
      p_invoice_id,
      v_variant_id,
      v_product_id,
      v_line ->> 'product_name',
      v_qty,
      v_unit_price,
      v_line_cost,
      v_tax_rate,
      v_line_tax,
      v_line_total,
      NULLIF(v_line ->> 'vendor_id', '')::uuid,
      NULLIF(v_line ->> 'unit_id', '')::uuid,
      v_line ->> 'description',
      v_taxable,
      v_pending_qty
    );

    v_subtotal := v_subtotal + v_taxable;
    v_tax := v_tax + v_line_tax;
    v_total := v_total + v_line_total;
  END LOOP;

  v_total := GREATEST(0, v_total - COALESCE(p_discount, 0));

  PERFORM public.assert_customer_credit_headroom(v_user_id, v_total, p_invoice_id);

  UPDATE public.invoices
  SET
    due_date = p_due_date,
    subtotal = v_subtotal,
    gst_amount = v_tax,
    total_amount = v_total,
    balance_due = v_total,
    discount = COALESCE(p_discount, 0),
    reference = p_reference,
    notes = p_notes,
    tax_inclusive = COALESCE(p_tax_inclusive, false),
    status = CASE WHEN v_status = 'pending' THEN 'issued' ELSE v_status END,
    issued_at = COALESCE(issued_at, now())
  WHERE id = p_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(p_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(p_invoice_id);
  PERFORM public.post_journal_for_invoice(p_invoice_id, p_actor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_resolve_invoice_line_cost(numeric, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_invoice_line_unit_cost(numeric, numeric, uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_invoice_item_margin_components(numeric, numeric, uuid, uuid, uuid, numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_allocate_receipt_cost_to_pending_sales(uuid, uuid, numeric, numeric) TO authenticated;

COMMIT;
