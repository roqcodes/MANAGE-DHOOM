-- Sales report profit used invoice_items.base_price; ERP invoices stored unit_price as base_price
-- when purchase_price was missing, making profit = 0.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_resolve_invoice_line_cost(
  p_purchase_price numeric,
  p_variant_id uuid,
  p_product_id uuid
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
  p_product_id uuid
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
    public.erp_resolve_invoice_line_cost(0, p_variant_id, p_product_id)
  );
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
          SUM(cost.purchase_cost) AS purchase_cost
        FROM public.invoices i
        LEFT JOIN LATERAL (
          SELECT SUM(
            public.erp_invoice_line_unit_cost(
              ii.base_price,
              ii.unit_price,
              ii.variant_id,
              ii.product_id
            ) * ii.quantity
          ) AS purchase_cost
          FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
        ) cost ON true
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
        ROUND(
          COALESCE(inv.total_sales_without_tax, 0)
          - COALESCE(inv.purchase_cost, 0)
          - COALESCE(cn.credit_note_total, 0),
          2
        ) AS profit,
        ROUND(
          CASE
            WHEN COALESCE(inv.total_sales_without_tax, 0) > 0 THEN
              100.0 * (
                COALESCE(inv.total_sales_without_tax, 0)
                - COALESCE(inv.purchase_cost, 0)
                - COALESCE(cn.credit_note_total, 0)
              ) / COALESCE(inv.total_sales_without_tax, 0)
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
        ROUND(COALESCE(SUM(cost.purchase_cost), 0), 2) AS purchase_cost,
        ROUND(
          COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(cost.purchase_cost), 0),
          2
        ) AS net_profit,
        ROUND(
          CASE
            WHEN COALESCE(SUM(i.subtotal), 0) > 0 THEN
              100.0 * (
                COALESCE(SUM(i.subtotal), 0) - COALESCE(SUM(cost.purchase_cost), 0)
              ) / COALESCE(SUM(i.subtotal), 0)
            ELSE 0
          END,
          3
        ) AS profit_percent,
        ROUND(COALESCE(SUM(i.balance_due), 0), 2) AS balance_due
      FROM public.invoices i
      JOIN public.users u ON u.id = i.user_id
      LEFT JOIN LATERAL (
        SELECT SUM(
          public.erp_invoice_line_unit_cost(
            ii.base_price,
            ii.unit_price,
            ii.variant_id,
            ii.product_id
          ) * ii.quantity
        ) AS purchase_cost
        FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
      ) cost ON true
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
        ROUND(
          COALESCE(
            SUM(
              public.erp_invoice_line_unit_cost(
                ii.base_price,
                ii.unit_price,
                ii.variant_id,
                ii.product_id
              ) * ii.quantity
            ),
            0
          ),
          2
        ) AS purchase_cost,
        ROUND(
          COALESCE(SUM(ii.total_amount), 0)
          - COALESCE(
            SUM(
              public.erp_invoice_line_unit_cost(
                ii.base_price,
                ii.unit_price,
                ii.variant_id,
                ii.product_id
              ) * ii.quantity
            ),
            0
          ),
          2
        ) AS profit
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
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

-- Persist true unit cost on new invoice lines (not selling price).
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
      v_product_id
    );

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
      unit_id, description, taxable_amount
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
      v_taxable
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

GRANT EXECUTE ON FUNCTION public.erp_resolve_invoice_line_cost(numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_invoice_line_unit_cost(numeric, numeric, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_salesman(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_customer(date, date, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_sales_by_item(date, date, uuid, text) TO authenticated;

-- update_erp_invoice: same unit cost resolution as create
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
      v_product_id
    );

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
      unit_id, description, taxable_amount
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
      v_taxable
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

COMMIT;
