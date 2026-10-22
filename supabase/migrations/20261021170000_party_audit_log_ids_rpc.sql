-- Fast party activity: one query for audit log ids (avoids N+1 API round-trips).

BEGIN;

CREATE INDEX IF NOT EXISTS audit_logs_entity_type_id_created_idx
  ON public.audit_logs (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.list_audit_log_ids_for_vendor_party(
  p_vendor_id uuid,
  p_limit int DEFAULT 50
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT al.id
  FROM public.audit_logs al
  WHERE public.is_staff_user(auth.uid())
    AND (
      al.store_id IS NULL
      OR public.rls_user_can_access_store(al.store_id)
    )
    AND (
      (al.entity_type = 'vendor' AND al.entity_id = p_vendor_id)
      OR (al.metadata->>'vendor_id') = p_vendor_id::text
      OR (
        al.entity_type = 'purchase_bill'
        AND EXISTS (
          SELECT 1
          FROM public.erp_purchase_bills pb
          WHERE pb.id = al.entity_id AND pb.vendor_id = p_vendor_id
        )
      )
      OR (
        al.entity_type = 'vendor_credit'
        AND EXISTS (
          SELECT 1
          FROM public.erp_vendor_credits vc
          WHERE vc.id = al.entity_id AND vc.vendor_id = p_vendor_id
        )
      )
      OR (
        al.entity_type = 'supplier_payment'
        AND EXISTS (
          SELECT 1
          FROM public.erp_supplier_payments sp
          WHERE sp.id = al.entity_id AND sp.vendor_id = p_vendor_id
        )
      )
      OR (
        al.entity_type = 'purchase_order'
        AND EXISTS (
          SELECT 1
          FROM public.purchase_orders po
          WHERE po.id = al.entity_id AND po.vendor_id = p_vendor_id
        )
      )
    )
  ORDER BY al.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

CREATE OR REPLACE FUNCTION public.list_audit_log_ids_for_customer_party(
  p_user_id uuid,
  p_limit int DEFAULT 50
)
RETURNS TABLE (id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT al.id
  FROM public.audit_logs al
  WHERE public.is_staff_user(auth.uid())
    AND (
      al.store_id IS NULL
      OR public.rls_user_can_access_store(al.store_id)
    )
    AND (
      (al.entity_type = 'customer' AND al.entity_id = p_user_id)
      OR (al.metadata->>'user_id') = p_user_id::text
      OR (
        al.entity_type IN ('invoice', 'sales_invoice')
        AND EXISTS (
          SELECT 1
          FROM public.invoices inv
          WHERE inv.id = al.entity_id AND inv.user_id = p_user_id
        )
      )
      OR (
        al.entity_type = 'credit_note'
        AND EXISTS (
          SELECT 1
          FROM public.erp_credit_notes cn
          WHERE cn.id = al.entity_id AND cn.user_id = p_user_id
        )
      )
      OR (
        al.entity_type = 'customer_payment'
        AND EXISTS (
          SELECT 1
          FROM public.erp_customer_payments cp
          WHERE cp.id = al.entity_id AND cp.user_id = p_user_id
        )
      )
    )
  ORDER BY al.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
$$;

REVOKE ALL ON FUNCTION public.list_audit_log_ids_for_vendor_party(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_audit_log_ids_for_customer_party(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_audit_log_ids_for_vendor_party(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_audit_log_ids_for_customer_party(uuid, int) TO authenticated;

COMMIT;
