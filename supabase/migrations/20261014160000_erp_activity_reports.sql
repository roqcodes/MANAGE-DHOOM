-- Activity log and cancelled (deleted) invoice reports with human-readable labels.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_audit_entity_display_name(
  p_entity_type text,
  p_entity_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_label text;
BEGIN
  IF p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  v_label := CASE lower(trim(COALESCE(p_entity_type, '')))
    WHEN 'invoice' THEN (
      SELECT i.invoice_number::text FROM public.invoices i WHERE i.id = p_entity_id
    )
    WHEN 'purchase_bill' THEN (
      SELECT b.purchase_bill_number FROM public.erp_purchase_bills b WHERE b.id = p_entity_id
    )
    WHEN 'estimate' THEN (
      SELECT e.estimate_number::text FROM public.erp_estimates e WHERE e.id = p_entity_id
    )
    WHEN 'credit_note' THEN (
      SELECT cn.credit_note_number::text FROM public.erp_credit_notes cn WHERE cn.id = p_entity_id
    )
    WHEN 'expense' THEN (
      SELECT ex.expense_number::text FROM public.erp_expenses ex WHERE ex.id = p_entity_id
    )
    WHEN 'customer_payment' THEN (
      SELECT p.payment_number FROM public.erp_customer_payments p WHERE p.id = p_entity_id
    )
    WHEN 'erp_payment' THEN (
      SELECT p.payment_number FROM public.erp_customer_payments p WHERE p.id = p_entity_id
    )
    WHEN 'supplier_payment' THEN (
      SELECT p.payment_number FROM public.erp_supplier_payments p WHERE p.id = p_entity_id
    )
    WHEN 'vendor_credit' THEN (
      SELECT vc.credit_number FROM public.erp_vendor_credits vc WHERE vc.id = p_entity_id
    )
    WHEN 'purchase_order' THEN (
      SELECT po.po_number FROM public.purchase_orders po WHERE po.id = p_entity_id
    )
    WHEN 'order' THEN (
      SELECT o.order_number::text FROM public.orders o WHERE o.id = p_entity_id
    )
    WHEN 'sales_order' THEN (
      SELECT o.order_number::text FROM public.orders o WHERE o.id = p_entity_id
    )
    WHEN 'product' THEN (
      SELECT p.name FROM public.products p WHERE p.id = p_entity_id
    )
    WHEN 'customer' THEN (
      SELECT u.name FROM public.users u WHERE u.id = p_entity_id
    )
    WHEN 'vendor' THEN (
      SELECT v.name FROM public.vendors v WHERE v.id = p_entity_id
    )
    WHEN 'journal_entry' THEN (
      SELECT j.journal_number FROM public.journal_entries j WHERE j.id = p_entity_id
    )
    WHEN 'store' THEN (
      SELECT s.name FROM public.stores s WHERE s.id = p_entity_id
    )
    ELSE NULL
  END;

  RETURN COALESCE(v_label, left(p_entity_id::text, 8));
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
        u.id AS user_id,
        COALESCE(u.name, u.email, 'Unknown user') AS user_name,
        u.email AS user_email,
        public.erp_audit_entity_display_name(al.entity_type, al.entity_id) AS entity_reference,
        initcap(replace(al.entity_type, '_', ' ')) AS entity_label,
        initcap(replace(al.action, '_', ' ')) AS activity_label
      FROM public.audit_logs al
      LEFT JOIN public.users u ON u.id = al.user_id
      LEFT JOIN public.stores s ON s.id = al.store_id
      WHERE al.created_at::date BETWEEN p_date_from AND p_date_to
        AND (p_store_id IS NULL OR al.store_id = p_store_id)
        AND (v_entity IS NULL OR v_entity = 'all' OR al.entity_type = v_entity)
        AND (v_action IS NULL OR v_action = 'all' OR al.action = v_action)
        AND (p_user_id IS NULL OR al.user_id = p_user_id)
        AND (
          v_search IS NULL
          OR al.description ILIKE '%' || v_search || '%'
          OR u.name ILIKE '%' || v_search || '%'
          OR u.email ILIKE '%' || v_search || '%'
          OR s.name ILIKE '%' || v_search || '%'
          OR public.erp_audit_entity_display_name(al.entity_type, al.entity_id) ILIKE '%' || v_search || '%'
        )
      ORDER BY al.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 1000))
    ) r
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_erp_deleted_invoices_report(
  p_date_from date,
  p_date_to date,
  p_store_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit int DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_search text := NULLIF(BTRIM(p_search), '');
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.deleted_at DESC NULLS LAST, r.invoice_created_at DESC)
    FROM (
      SELECT
        i.id AS invoice_id,
        i.created_at AS invoice_created_at,
        i.invoice_number,
        cu.name AS customer_name,
        s.name AS store_name,
        ROUND(i.total_amount, 2) AS total_amount,
        ROUND(COALESCE(i.discount, 0), 2) AS discount,
        ROUND(i.total_amount - COALESCE(i.discount, 0), 2) AS net_amount,
        ROUND(i.gst_amount, 2) AS tax_amount,
        cancel_log.deleted_at,
        COALESCE(cancel_user.name, cancel_user.email, 'Unknown user') AS deleted_by_name,
        COALESCE(cancel_log.reason, cancel_log.description, '—') AS delete_reason,
        COALESCE(create_user.name, create_user.email, sp.name, 'Unknown user') AS created_by_name,
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'product_name', ii.product_name,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'gst_amount', ii.gst_amount,
            'total_amount', ii.total_amount
          ) ORDER BY ii.product_name), '[]'::jsonb)
          FROM public.invoice_items ii
          WHERE ii.invoice_id = i.id
        ) AS line_items,
        (
          SELECT p.payment_mode
          FROM public.erp_payment_allocations a
          JOIN public.erp_customer_payments p ON p.id = a.payment_id
          WHERE a.invoice_id = i.id
          ORDER BY p.payment_date DESC
          LIMIT 1
        ) AS payment_mode
      FROM public.invoices i
      JOIN public.users cu ON cu.id = i.user_id
      LEFT JOIN public.stores s ON s.id = i.store_id
      LEFT JOIN LATERAL (
        SELECT
          al.created_at AS deleted_at,
          al.description,
          COALESCE(al.metadata->>'reason', al.metadata->>'cancel_reason') AS reason,
          al.user_id
        FROM public.audit_logs al
        WHERE al.entity_type = 'invoice'
          AND al.entity_id = i.id
          AND al.action IN ('cancel', 'delete')
        ORDER BY al.created_at DESC
        LIMIT 1
      ) cancel_log ON true
      LEFT JOIN public.users cancel_user ON cancel_user.id = cancel_log.user_id
      LEFT JOIN LATERAL (
        SELECT al.user_id
        FROM public.audit_logs al
        WHERE al.entity_type = 'invoice'
          AND al.entity_id = i.id
          AND al.action = 'create'
        ORDER BY al.created_at ASC
        LIMIT 1
      ) create_log ON true
      LEFT JOIN public.users create_user ON create_user.id = create_log.user_id
      LEFT JOIN public.users sp ON sp.id = i.sales_person_id
      WHERE i.status = 'cancelled'
        AND (
          cancel_log.deleted_at IS NULL
          OR cancel_log.deleted_at::date BETWEEN p_date_from AND p_date_to
        )
        AND (p_store_id IS NULL OR i.store_id = p_store_id)
        AND (
          v_search IS NULL
          OR i.invoice_number::text ILIKE '%' || v_search || '%'
          OR cu.name ILIKE '%' || v_search || '%'
          OR cancel_user.name ILIKE '%' || v_search || '%'
          OR create_user.name ILIKE '%' || v_search || '%'
        )
      ORDER BY cancel_log.deleted_at DESC NULLS LAST, i.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 500))
    ) r
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_audit_entity_display_name(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_activity_log_report(date, date, uuid, text, text, uuid, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_erp_deleted_invoices_report(date, date, uuid, text, int) TO authenticated;

COMMIT;
