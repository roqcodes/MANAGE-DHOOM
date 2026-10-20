-- ERP salesmen (PIN-attributed sellers) separate from portal Sales Counter staff role.

BEGIN;

UPDATE public.rbac_roles
SET name = 'Sales Counter', description = 'Counter POS: estimates, orders, and customers.'
WHERE slug = 'salesman';

CREATE TABLE IF NOT EXISTS public.erp_salesmen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  pin char(3) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  CONSTRAINT erp_salesmen_pin_format CHECK (pin ~ '^[0-9]{3}$'),
  CONSTRAINT erp_salesmen_pin_unique UNIQUE (pin)
);

CREATE INDEX IF NOT EXISTS erp_salesmen_active_idx ON public.erp_salesmen (is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS erp_salesmen_name_idx ON public.erp_salesmen (lower(name));

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS salesman_id uuid REFERENCES public.erp_salesmen (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS audit_logs_salesman_id_idx ON public.audit_logs (salesman_id);

-- Repoint invoice / sales order attribution from portal users to erp_salesmen.
UPDATE public.invoices SET sales_person_id = NULL WHERE sales_person_id IS NOT NULL;
UPDATE public.orders SET sales_person_id = NULL WHERE sales_person_id IS NOT NULL;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_sales_person_id_fkey;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_sales_person_id_fkey;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_sales_person_id_fkey
  FOREIGN KEY (sales_person_id) REFERENCES public.erp_salesmen (id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_sales_person_id_fkey
  FOREIGN KEY (sales_person_id) REFERENCES public.erp_salesmen (id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.assert_erp_salesman_id(p_salesman_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_salesman_id IS NULL THEN
    RAISE EXCEPTION 'Salesman PIN is required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.erp_salesmen s
    WHERE s.id = p_salesman_id AND s.is_active
  ) THEN
    RAISE EXCEPTION 'Invalid or inactive salesman' USING ERRCODE = '22023';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_erp_salesman_pin(p_pin text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pin char(3);
  v_row public.erp_salesmen%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  v_pin := NULLIF(BTRIM(p_pin), '');
  IF v_pin IS NULL OR v_pin !~ '^[0-9]{3}$' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM public.erp_salesmen s
  WHERE s.pin = v_pin AND s.is_active
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_erp_salesman(
  p_name text,
  p_pin text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_pin char(3);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF NULLIF(BTRIM(p_name), '') IS NULL THEN
    RAISE EXCEPTION 'Name is required' USING ERRCODE = '22023';
  END IF;

  v_pin := NULLIF(BTRIM(p_pin), '');
  IF v_pin IS NULL OR v_pin !~ '^[0-9]{3}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 3 digits' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.erp_salesmen (name, email, phone, pin, created_by)
  VALUES (
    BTRIM(p_name),
    NULLIF(BTRIM(p_email), ''),
    NULLIF(BTRIM(p_phone), ''),
    v_pin,
    auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action text,
  p_entity_type text,
  p_entity_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_old_data jsonb DEFAULT NULL,
  p_new_data jsonb DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT auth.uid(),
  p_salesman_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_store_id uuid := p_store_id;
  v_actor uuid := auth.uid();
  v_attributed_user uuid;
BEGIN
  IF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_salesman_id IS NOT NULL THEN
    PERFORM public.assert_erp_salesman_id(p_salesman_id);
    v_attributed_user := NULL;
  ELSE
    v_attributed_user := COALESCE(p_user_id, v_actor);
    IF v_attributed_user IS NULL OR NOT public.is_staff_user(v_attributed_user) THEN
      RAISE EXCEPTION 'Not authenticated';
    END IF;
  END IF;

  IF v_store_id IS NULL THEN
    SELECT (public.get_erp_context(v_actor) ->> 'store_id')::uuid
    INTO v_store_id;
  END IF;

  INSERT INTO public.audit_logs (
    user_id, salesman_id, store_id, action, entity_type, entity_id,
    description, metadata, old_data, new_data
  )
  VALUES (
    v_attributed_user, p_salesman_id, v_store_id, p_action, p_entity_type, p_entity_id,
    p_description, COALESCE(p_metadata, '{}'::jsonb), p_old_data, p_new_data
  )
  RETURNING id INTO v_id;

  RETURN v_id;
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
      LEFT JOIN public.erp_salesmen sp ON sp.id = c.sales_person_id
    ) r
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_activity_log_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
  v_entity text := NULLIF(BTRIM(p_entity_type), '');
  v_action text := NULLIF(BTRIM(p_action), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC)
    FROM (
      SELECT
        al.id,
        al.created_at,
        al.action,
        al.entity_type,
        al.entity_id,
        al.description,
        al.store_id,
        s.name AS store_name,
        COALESCE(sm.id, u.id) AS user_id,
        COALESCE(sm.name, u.name, u.email, 'Unknown user') AS user_name,
        COALESCE(u.email, sm.email) AS user_email,
        public.erp_audit_entity_display_name(al.entity_type, al.entity_id) AS entity_reference,
        initcap(replace(al.entity_type, '_', ' ')) AS entity_label,
        initcap(replace(al.action, '_', ' ')) AS activity_label
      FROM public.audit_logs al
      LEFT JOIN public.users u ON u.id = al.user_id
      LEFT JOIN public.erp_salesmen sm ON sm.id = al.salesman_id
      LEFT JOIN public.stores s ON s.id = al.store_id
      WHERE al.created_at::date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR al.store_id = p_store_id)
        AND (v_entity IS NULL OR v_entity = 'all' OR al.entity_type = v_entity)
        AND (v_action IS NULL OR v_action = 'all' OR al.action = v_action)
        AND (
          p_user_id IS NULL
          OR al.user_id = p_user_id
          OR al.salesman_id = p_user_id
        )
        AND (
          v_search IS NULL
          OR al.description ILIKE '%' || v_search || '%'
          OR u.name ILIKE '%' || v_search || '%'
          OR u.email ILIKE '%' || v_search || '%'
          OR sm.name ILIKE '%' || v_search || '%'
          OR s.name ILIKE '%' || v_search || '%'
          OR public.erp_audit_entity_display_name(al.entity_type, al.entity_id) ILIKE '%' || v_search || '%'
        )
      ORDER BY al.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000))
    ) r
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE VIEW public.ai_v_invoices
WITH (security_invoker = true) AS
SELECT
  i.id,
  i.invoice_number,
  i.status,
  i.source,
  i.issued_at,
  i.created_at,
  i.due_date,
  i.subtotal,
  i.gst_amount,
  i.discount,
  i.total_amount,
  i.amount_paid,
  i.balance_due,
  i.store_id,
  s.name AS store_name,
  i.user_id AS customer_id,
  COALESCE(c.company_name, c.contact_display_name, c.name) AS customer_name,
  i.sales_person_id AS salesman_id,
  COALESCE(sp.name, 'Unassigned') AS salesman_name
FROM public.invoices i
LEFT JOIN public.users c ON c.id = i.user_id
LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id
LEFT JOIN public.stores s ON s.id = i.store_id;

CREATE OR REPLACE VIEW public.ai_v_invoice_lines
WITH (security_invoker = true) AS
SELECT
  li.id AS line_id,
  li.invoice_id,
  i.invoice_number,
  i.issued_at,
  i.created_at,
  i.status AS invoice_status,
  COALESCE(c.company_name, c.contact_display_name, c.name) AS customer_name,
  COALESCE(sp.name, 'Unassigned') AS salesman_name,
  li.product_id,
  li.product_name,
  li.quantity,
  li.unit_price,
  li.total_amount AS line_total,
  s.name AS store_name
FROM public.invoice_items li
JOIN public.invoices i ON i.id = li.invoice_id
LEFT JOIN public.users c ON c.id = i.user_id
LEFT JOIN public.erp_salesmen sp ON sp.id = i.sales_person_id
LEFT JOIN public.stores s ON s.id = i.store_id;

CREATE OR REPLACE FUNCTION public.erp_create_sales_invoice_from_payload(
  p_payload jsonb,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_user_id uuid;
  v_sales_person_id uuid;
  v_invoice_id uuid;
  v_lines jsonb;
  v_finalize boolean;
  v_invoice_number text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_user_id := NULLIF(p_payload ->> 'userId', '')::uuid;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Customer is required' USING ERRCODE = '22023';
  END IF;

  v_sales_person_id := NULLIF(p_payload ->> 'salesPersonId', '')::uuid;
  PERFORM public.assert_erp_salesman_id(v_sales_person_id);

  v_lines := public.erp_invoice_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  v_finalize := COALESCE((p_payload ->> 'finalize')::boolean, false);

  v_invoice_id := public.create_erp_invoice(
    v_user_id,
    p_store_id,
    COALESCE(NULLIF(p_payload ->> 'invoiceDate', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_payload ->> 'dueDate', '')::date, CURRENT_DATE),
    v_lines,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    COALESCE((p_payload ->> 'taxInclusive')::boolean, false),
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    v_sales_person_id,
    NULLIF(p_payload ->> 'estimateId', '')::uuid,
    v_finalize,
    v_uid
  );

  SELECT invoice_number INTO v_invoice_number FROM public.invoices WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice_number,
    'status', CASE WHEN v_finalize THEN 'issued' ELSE 'pending' END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_update_sales_invoice_from_payload(
  p_payload jsonb,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_sales_person_id uuid;
  v_store_id uuid;
  v_lines jsonb;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  v_invoice_id := NULLIF(p_payload ->> 'invoiceId', '')::uuid;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required' USING ERRCODE = '22023';
  END IF;

  v_sales_person_id := NULLIF(p_payload ->> 'salesPersonId', '')::uuid;
  PERFORM public.assert_erp_salesman_id(v_sales_person_id);

  SELECT store_id, status INTO v_store_id, v_status
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;

  IF v_store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_lines := public.erp_invoice_lines_json_from_payload(p_payload -> 'lines');
  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required' USING ERRCODE = '22023';
  END IF;

  PERFORM public.update_erp_invoice(
    v_invoice_id,
    COALESCE(NULLIF(p_payload ->> 'invoiceDate', '')::date, CURRENT_DATE),
    COALESCE(NULLIF(p_payload ->> 'dueDate', '')::date, CURRENT_DATE),
    v_lines,
    COALESCE((p_payload ->> 'discount')::numeric, 0),
    COALESCE((p_payload ->> 'taxInclusive')::boolean, false),
    NULLIF(p_payload ->> 'reference', ''),
    NULLIF(p_payload ->> 'notes', ''),
    v_sales_person_id,
    v_uid
  );

  SELECT status INTO v_status FROM public.invoices WHERE id = v_invoice_id;

  RETURN jsonb_build_object(
    'invoiceId', v_invoice_id,
    'status', v_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_issue_sales_invoice_from_payload(
  p_payload jsonb,
  p_store_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoice_id uuid;
  v_sales_person_id uuid;
  v_status text;
  v_store_id uuid;
  v_lines jsonb;
  v_paid numeric;
  v_credits numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED' USING ERRCODE = '28000';
  END IF;

  v_invoice_id := NULLIF(p_payload ->> 'invoiceId', '')::uuid;
  IF v_invoice_id IS NULL THEN
    RAISE EXCEPTION 'Invoice id is required' USING ERRCODE = '22023';
  END IF;

  v_sales_person_id := NULLIF(p_payload ->> 'salesPersonId', '')::uuid;
  PERFORM public.assert_erp_salesman_id(v_sales_person_id);

  SELECT status, store_id INTO v_status, v_store_id
  FROM public.invoices
  WHERE id = v_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found' USING ERRCODE = '22023';
  END IF;

  IF v_store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH' USING ERRCODE = '42501';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  IF v_status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot issue a cancelled invoice' USING ERRCODE = '22023';
  END IF;

  IF v_status = 'issued' THEN
    RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'issued');
  END IF;

  IF v_status NOT IN ('pending', 'draft') THEN
    RAISE EXCEPTION 'Invoice cannot be issued from its current status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.invoices
  SET sales_person_id = v_sales_person_id
  WHERE id = v_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.erp_payment_allocations WHERE invoice_id = v_invoice_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_credits
  FROM public.erp_credit_note_applications WHERE invoice_id = v_invoice_id;

  IF v_paid > 0 OR v_credits > 0 THEN
    RAISE EXCEPTION 'Cannot issue invoice after payments or credit notes' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'product_id', ii.product_id,
        'variant_id', ii.variant_id,
        'product_name', ii.product_name,
        'quantity', ii.quantity,
        'unit_price', ii.unit_price,
        'tax_rate_percent', ii.gst_rate
      )
    ),
    '[]'::jsonb
  )
  INTO v_lines
  FROM public.invoice_items ii
  WHERE ii.invoice_id = v_invoice_id;

  PERFORM public.assert_erp_sales_lines_store_stock(v_store_id, v_lines, v_uid);

  UPDATE public.invoices
  SET
    status = 'issued',
    issued_at = COALESCE(issued_at, now())
  WHERE id = v_invoice_id;

  PERFORM public.inventory_apply_invoice_stock(v_invoice_id, -1);
  PERFORM public.recalculate_invoice_balance(v_invoice_id);
  PERFORM public.post_journal_for_invoice(v_invoice_id, v_uid);

  RETURN jsonb_build_object('invoiceId', v_invoice_id, 'status', 'issued');
END;
$$;

ALTER TABLE public.erp_salesmen ENABLE ROW LEVEL SECURITY;

CREATE POLICY erp_salesmen_select_staff ON public.erp_salesmen
  FOR SELECT TO authenticated
  USING (public.is_staff_user());

CREATE POLICY erp_salesmen_manage_super_admin ON public.erp_salesmen
  FOR ALL TO authenticated
  USING (public.is_super_admin_user())
  WITH CHECK (public.is_super_admin_user());

GRANT SELECT ON public.erp_salesmen TO authenticated;
GRANT EXECUTE ON FUNCTION public.assert_erp_salesman_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_erp_salesman_pin(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_erp_salesman(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_audit_event(text, text, uuid, text, jsonb, jsonb, jsonb, uuid, uuid, uuid) TO authenticated;

COMMIT;
