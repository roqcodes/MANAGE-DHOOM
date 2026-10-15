-- Read-only views + SELECT RPC for the DHOOM AI assistant.
-- Views use security_invoker so caller RLS still applies.

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
LEFT JOIN public.users sp ON sp.id = i.sales_person_id
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
LEFT JOIN public.users sp ON sp.id = i.sales_person_id
LEFT JOIN public.stores s ON s.id = i.store_id;

CREATE OR REPLACE VIEW public.ai_v_purchase_bills
WITH (security_invoker = true) AS
SELECT
  b.id,
  b.purchase_bill_number,
  b.vendor_bill_number,
  b.status,
  b.purchase_date,
  b.created_at,
  b.updated_at,
  b.due_date,
  b.total_amount,
  b.amount_paid,
  b.balance_due,
  s.name AS store_name,
  v.name AS vendor_name,
  creator.name AS created_by_name
FROM public.erp_purchase_bills b
LEFT JOIN public.stores s ON s.id = b.store_id
LEFT JOIN public.vendors v ON v.id = b.vendor_id
LEFT JOIN public.users creator ON creator.id = b.created_by;

CREATE OR REPLACE VIEW public.ai_v_purchase_bill_lines
WITH (security_invoker = true) AS
SELECT
  ln.id AS line_id,
  ln.purchase_bill_id,
  b.purchase_bill_number,
  b.purchase_date,
  v.name AS vendor_name,
  ln.product_name,
  ln.quantity,
  ln.purchase_price,
  ln.line_total
FROM public.erp_purchase_bill_lines ln
JOIN public.erp_purchase_bills b ON b.id = ln.purchase_bill_id
LEFT JOIN public.vendors v ON v.id = b.vendor_id;

CREATE OR REPLACE VIEW public.ai_v_customers
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.name,
  u.company_name,
  u.contact_display_name,
  u.customer_number,
  u.phone,
  u.created_at
FROM public.users u
WHERE u.role = 'customer' OR u.role IS NULL;

CREATE OR REPLACE VIEW public.ai_v_team
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.name,
  u.role,
  u.is_verified
FROM public.users u
WHERE u.role IS NOT NULL
  AND u.role <> 'customer'
  AND u.role <> 'vendor';

CREATE OR REPLACE VIEW public.ai_v_products
WITH (security_invoker = true) AS
SELECT
  p.id,
  p.name,
  p.is_active,
  p.item_type,
  p.price,
  p.purchase_price,
  p.barcode,
  b.name AS brand_name,
  c.name AS category_name
FROM public.products p
LEFT JOIN public.brands b ON b.id = p.brand_id
LEFT JOIN public.categories c ON c.id = p.category_id;

CREATE OR REPLACE VIEW public.ai_v_audit
WITH (security_invoker = true) AS
SELECT
  al.id,
  al.created_at,
  al.action,
  al.entity_type,
  al.entity_id,
  al.description,
  actor.name AS actor_name,
  actor.role AS actor_role,
  s.name AS store_name
FROM public.audit_logs al
LEFT JOIN public.users actor ON actor.id = al.user_id
LEFT JOIN public.stores s ON s.id = al.store_id;

GRANT SELECT ON
  public.ai_v_invoices,
  public.ai_v_invoice_lines,
  public.ai_v_purchase_bills,
  public.ai_v_purchase_bill_lines,
  public.ai_v_customers,
  public.ai_v_team,
  public.ai_v_products,
  public.ai_v_audit
TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_assistant_run_select(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  cleaned text;
  scanned text;
  result jsonb;
BEGIN
  PERFORM set_config('statement_timeout', '4000', true);

  cleaned := btrim(p_sql);
  cleaned := regexp_replace(cleaned, ';+\s*$', '', 'g');

  IF cleaned IS NULL OR length(cleaned) < 12 OR length(cleaned) > 2500 THEN
    RAISE EXCEPTION 'Query rejected: invalid length';
  END IF;

  IF position(';' IN cleaned) > 0 THEN
    RAISE EXCEPTION 'Query rejected: single statement only';
  END IF;

  scanned := lower(cleaned);

  IF scanned !~ '^(select|with)[[:space:]]' THEN
    RAISE EXCEPTION 'Query rejected: SELECT only';
  END IF;

  IF scanned ~ '(insert|update|delete|merge|drop|alter|create|truncate|grant|revoke|copy|vacuum|execute|pg_sleep|pg_read|dblink|into[[:space:]])' THEN
    RAISE EXCEPTION 'Query rejected: blocked keyword';
  END IF;

  IF position('ai_v_' IN scanned) = 0 THEN
    RAISE EXCEPTION 'Query rejected: ai_v_* views only';
  END IF;

  IF scanned !~ '[[:space:]]limit[[:space:]]+[0-9]+' THEN
    cleaned := cleaned || ' LIMIT 50';
  END IF;

  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (%s) AS t',
    cleaned
  ) INTO result;

  RETURN jsonb_build_object(
    'rows', COALESCE(result, '[]'::jsonb),
    'rowCount', jsonb_array_length(COALESCE(result, '[]'::jsonb))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ai_assistant_run_select(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ai_assistant_run_select(text) TO authenticated;
