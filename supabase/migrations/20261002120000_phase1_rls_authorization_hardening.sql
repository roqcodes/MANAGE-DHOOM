-- Phase 1: RLS / authorization hardening
-- Store access: admins → all stores; managers → user_store_access rows only.
-- Do not trust client-supplied store_id — RLS and RPCs use user_has_store_access().

BEGIN;

-- ─── Core authorization helpers (consolidated) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.is_admin_user(p_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = p_user_id
      AND u.role::text = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.user_has_store_access(
  p_user_id uuid,
  p_store_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_user_id IS NOT NULL
    AND p_store_id IS NOT NULL
    AND (
      public.is_admin_user(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_store_access usa
        WHERE usa.user_id = p_user_id
          AND usa.store_id = p_store_id
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.rls_user_can_access_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.user_has_store_access(auth.uid(), p_store_id);
$$;

CREATE OR REPLACE FUNCTION public.rls_staff_invoice_store_visible(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff_user()
    AND (
      (p_store_id IS NOT NULL AND public.rls_user_can_access_store(p_store_id))
      OR (p_store_id IS NULL AND public.is_admin_user())
    );
$$;

CREATE OR REPLACE FUNCTION public.rls_staff_order_visible(p_store_id uuid, p_source text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_staff_user()
    AND (
      (p_store_id IS NOT NULL AND public.rls_user_can_access_store(p_store_id))
      OR (
        p_store_id IS NULL
        AND COALESCE(p_source, 'online') = 'online'
      )
    );
$$;

-- ─── Active store switch: do not auto-grant store access to managers ─────────

CREATE OR REPLACE FUNCTION public.set_user_active_store(
  p_store_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = p_store_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid store';
  END IF;

  IF public.is_admin_user(p_user_id) THEN
    INSERT INTO public.user_store_access (user_id, store_id, is_default)
    VALUES (p_user_id, p_store_id, true)
    ON CONFLICT (user_id, store_id)
    DO UPDATE SET is_default = true;

    UPDATE public.user_store_access
    SET is_default = false
    WHERE user_id = p_user_id AND store_id <> p_store_id;
  ELSE
    PERFORM public.require_store_access(p_store_id, p_user_id);

    UPDATE public.user_store_access
    SET is_default = (store_id = p_store_id)
    WHERE user_id = p_user_id;
  END IF;

  INSERT INTO public.user_erp_preferences (user_id, active_store_id, updated_at)
  VALUES (p_user_id, p_store_id, now())
  ON CONFLICT (user_id)
  DO UPDATE SET active_store_id = EXCLUDED.active_store_id, updated_at = now();

  RETURN public.get_erp_context(p_user_id);
END;
$$;

-- ─── Movement / audit RPC hardening ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_all_movements(
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_type_filter text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(row_to_json(t))
      FROM (
        SELECT sm.*
        FROM public.stock_movements sm
        WHERE (
          sm.store_id IS NULL
          OR public.rls_user_can_access_store(sm.store_id)
        )
        AND (p_type_filter IS NULL OR sm.type = p_type_filter)
        ORDER BY sm.created_at DESC
        LIMIT p_limit OFFSET p_offset
      ) t
    ),
    '[]'::json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_movements_for_variant(
  p_variant_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', sm.id,
          'variant_id', sm.variant_id,
          'product_id', sm.product_id,
          'quantity', sm.quantity,
          'type', sm.type,
          'reference_id', sm.reference_id,
          'reference_type', sm.reference_type,
          'reason', sm.reason,
          'user_id', sm.user_id,
          'store_id', sm.store_id,
          'created_at', sm.created_at
        ) ORDER BY sm.created_at DESC
      )
      FROM public.stock_movements sm
      WHERE sm.variant_id = p_variant_id
        AND (
          sm.store_id IS NULL
          OR public.rls_user_can_access_store(sm.store_id)
        )
      LIMIT p_limit OFFSET p_offset
    ),
    '[]'::json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_movements_count(p_variant_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.stock_movements sm
  WHERE sm.variant_id = p_variant_id
    AND (
      sm.store_id IS NULL
      OR public.rls_user_can_access_store(sm.store_id)
    );

  RETURN v_count;
END;
$$;

-- ─── stock_movements RLS ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "Authenticated users can view stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Authenticated users can insert stock movements" ON public.stock_movements;

CREATE POLICY "stock_movements_staff_store_select"
  ON public.stock_movements FOR SELECT
  TO authenticated
  USING (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  );

-- ─── Catalog & customers (ecommerce read + staff manage) ───────────────────

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products_public_read" ON public.products;
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

DROP POLICY IF EXISTS "products_staff_manage" ON public.products;
CREATE POLICY "products_staff_manage"
  ON public.products FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "product_variants_public_read" ON public.product_variants;
CREATE POLICY "product_variants_public_read"
  ON public.product_variants FOR SELECT
  TO authenticated, anon
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_id AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS "product_variants_staff_manage" ON public.product_variants;
CREATE POLICY "product_variants_staff_manage"
  ON public.product_variants FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "categories_public_read" ON public.categories;
CREATE POLICY "categories_public_read"
  ON public.categories FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

DROP POLICY IF EXISTS "categories_staff_manage" ON public.categories;
CREATE POLICY "categories_staff_manage"
  ON public.categories FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "brands_public_read" ON public.brands;
CREATE POLICY "brands_public_read"
  ON public.brands FOR SELECT
  TO authenticated, anon
  USING (is_active = true);

DROP POLICY IF EXISTS "brands_staff_manage" ON public.brands;
CREATE POLICY "brands_staff_manage"
  ON public.brands FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON public.users;
CREATE POLICY "users_select_own"
  ON public.users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "users_staff_select" ON public.users;
CREATE POLICY "users_staff_select"
  ON public.users FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"
  ON public.users FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users_staff_update" ON public.users;
CREATE POLICY "users_staff_update"
  ON public.users FOR UPDATE
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "users_insert_self" ON public.users;
CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

-- ─── Orders ────────────────────────────────────────────────────────────────

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "orders_customer_own" ON public.orders;
CREATE POLICY "orders_customer_own"
  ON public.orders FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "orders_staff_store" ON public.orders;
CREATE POLICY "orders_staff_store"
  ON public.orders FOR ALL
  TO authenticated
  USING (public.rls_staff_order_visible(store_id, source))
  WITH CHECK (public.rls_staff_order_visible(store_id, source));

DROP POLICY IF EXISTS "order_items_customer_own" ON public.order_items;
CREATE POLICY "order_items_customer_own"
  ON public.order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id AND o.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "order_items_staff" ON public.order_items;
CREATE POLICY "order_items_staff"
  ON public.order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.rls_staff_order_visible(o.store_id, o.source)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_id
        AND public.rls_staff_order_visible(o.store_id, o.source)
    )
  );

-- ─── Online inventory (per store × variant) ──────────────────────────────────

ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inventory_staff_store" ON public.inventory;
CREATE POLICY "inventory_staff_store"
  ON public.inventory FOR ALL
  TO authenticated
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

-- ─── Vendors & procurement ─────────────────────────────────────────────────

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendors_staff" ON public.vendors;
CREATE POLICY "vendors_staff"
  ON public.vendors FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "vendors_portal_self" ON public.vendors;
CREATE POLICY "vendors_portal_self"
  ON public.vendors FOR SELECT
  TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "vendor_products_staff" ON public.vendor_products;
CREATE POLICY "vendor_products_staff"
  ON public.vendor_products FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "purchase_orders_access" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_staff_write" ON public.purchase_orders;
DROP POLICY IF EXISTS "purchase_orders_staff_update" ON public.purchase_orders;
CREATE POLICY "purchase_orders_access"
  ON public.purchase_orders FOR SELECT
  TO authenticated
  USING (
    vendor_id = auth.uid()
    OR (
      public.is_staff_user()
      AND (
        store_id IS NULL
        OR public.rls_user_can_access_store(store_id)
      )
    )
  );

CREATE POLICY "purchase_orders_staff_write"
  ON public.purchase_orders FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  );

CREATE POLICY "purchase_orders_staff_update"
  ON public.purchase_orders FOR UPDATE
  TO authenticated
  USING (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  )
  WITH CHECK (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  );

DROP POLICY IF EXISTS "purchase_order_items_access" ON public.purchase_order_items;
DROP POLICY IF EXISTS "purchase_order_items_staff_write" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_access"
  ON public.purchase_order_items FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_id
        AND (
          po.vendor_id = auth.uid()
          OR (
            public.is_staff_user()
            AND (
              po.store_id IS NULL
              OR public.rls_user_can_access_store(po.store_id)
            )
          )
        )
    )
  );

CREATE POLICY "purchase_order_items_staff_write"
  ON public.purchase_order_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_id
        AND public.is_staff_user()
        AND (
          po.store_id IS NULL
          OR public.rls_user_can_access_store(po.store_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.purchase_orders po
      WHERE po.id = po_id
        AND public.is_staff_user()
        AND (
          po.store_id IS NULL
          OR public.rls_user_can_access_store(po.store_id)
        )
    )
  );

-- ─── Org / store membership ────────────────────────────────────────────────

DROP POLICY IF EXISTS "stores_staff_select" ON public.stores;
DROP POLICY IF EXISTS "stores_staff_manage" ON public.stores;

CREATE POLICY "stores_select"
  ON public.stores FOR SELECT
  TO authenticated
  USING (
    public.is_admin_user()
    OR EXISTS (
      SELECT 1 FROM public.user_store_access usa
      WHERE usa.user_id = auth.uid() AND usa.store_id = id
    )
  );

CREATE POLICY "stores_admin_manage"
  ON public.stores FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "user_store_access_self_select" ON public.user_store_access;
DROP POLICY IF EXISTS "user_store_access_staff_manage" ON public.user_store_access;

CREATE POLICY "user_store_access_self_select"
  ON public.user_store_access FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin_user());

CREATE POLICY "user_store_access_admin_manage"
  ON public.user_store_access FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "store_product_inventory_staff" ON public.store_product_inventory;
CREATE POLICY "store_product_inventory_store_access"
  ON public.store_product_inventory FOR ALL
  TO authenticated
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "store_inventory_staff" ON public.store_inventory;
CREATE POLICY "store_inventory_store_access"
  ON public.store_inventory FOR ALL
  TO authenticated
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

-- ─── Invoices (customer + store-scoped staff) ──────────────────────────────

DROP POLICY IF EXISTS "invoices_staff" ON public.invoices;
CREATE POLICY "invoices_staff_store"
  ON public.invoices FOR ALL
  TO authenticated
  USING (public.rls_staff_invoice_store_visible(store_id))
  WITH CHECK (public.rls_staff_invoice_store_visible(store_id));

DROP POLICY IF EXISTS "invoice_items_staff" ON public.invoice_items;
CREATE POLICY "invoice_items_staff_store"
  ON public.invoice_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND public.rls_staff_invoice_store_visible(i.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_id
        AND public.rls_staff_invoice_store_visible(i.store_id)
    )
  );

-- ─── Store-scoped ERP tables (replace blanket staff policies) ──────────────

DROP POLICY IF EXISTS "erp_estimates_staff" ON public.erp_estimates;
CREATE POLICY "erp_estimates_store_access"
  ON public.erp_estimates FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_estimate_lines_staff" ON public.erp_estimate_lines;
CREATE POLICY "erp_estimate_lines_store_access"
  ON public.erp_estimate_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_estimates e
      WHERE e.id = estimate_id
        AND public.rls_user_can_access_store(e.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_estimates e
      WHERE e.id = estimate_id
        AND public.rls_user_can_access_store(e.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_customer_payments_staff" ON public.erp_customer_payments;
CREATE POLICY "erp_customer_payments_store_access"
  ON public.erp_customer_payments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_payment_allocations_staff" ON public.erp_payment_allocations;
CREATE POLICY "erp_payment_allocations_store_access"
  ON public.erp_payment_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_customer_payments p
      WHERE p.id = payment_id
        AND public.rls_user_can_access_store(p.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_customer_payments p
      WHERE p.id = payment_id
        AND public.rls_user_can_access_store(p.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_credit_notes_staff" ON public.erp_credit_notes;
CREATE POLICY "erp_credit_notes_store_access"
  ON public.erp_credit_notes FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_credit_note_lines_staff" ON public.erp_credit_note_lines;
CREATE POLICY "erp_credit_note_lines_store_access"
  ON public.erp_credit_note_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_credit_notes cn
      WHERE cn.id = credit_note_id
        AND public.rls_user_can_access_store(cn.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_credit_notes cn
      WHERE cn.id = credit_note_id
        AND public.rls_user_can_access_store(cn.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_credit_note_applications_staff" ON public.erp_credit_note_applications;
CREATE POLICY "erp_credit_note_applications_store_access"
  ON public.erp_credit_note_applications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_credit_notes cn
      WHERE cn.id = credit_note_id
        AND public.rls_user_can_access_store(cn.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_credit_notes cn
      WHERE cn.id = credit_note_id
        AND public.rls_user_can_access_store(cn.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_purchase_bills_staff" ON public.erp_purchase_bills;
CREATE POLICY "erp_purchase_bills_store_access"
  ON public.erp_purchase_bills FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_purchase_bill_lines_staff" ON public.erp_purchase_bill_lines;
CREATE POLICY "erp_purchase_bill_lines_store_access"
  ON public.erp_purchase_bill_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_purchase_bills b
      WHERE b.id = purchase_bill_id
        AND public.rls_user_can_access_store(b.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_purchase_bills b
      WHERE b.id = purchase_bill_id
        AND public.rls_user_can_access_store(b.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_purchase_bill_landed_costs_staff" ON public.erp_purchase_bill_landed_costs;
CREATE POLICY "erp_purchase_bill_landed_costs_store_access"
  ON public.erp_purchase_bill_landed_costs FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_purchase_bills b
      WHERE b.id = purchase_bill_id
        AND public.rls_user_can_access_store(b.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_purchase_bills b
      WHERE b.id = purchase_bill_id
        AND public.rls_user_can_access_store(b.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_purchase_receives_staff" ON public.erp_purchase_receives;
CREATE POLICY "erp_purchase_receives_store_access"
  ON public.erp_purchase_receives FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_purchase_receive_lines_staff" ON public.erp_purchase_receive_lines;
CREATE POLICY "erp_purchase_receive_lines_store_access"
  ON public.erp_purchase_receive_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_purchase_receives r
      WHERE r.id = purchase_receive_id
        AND public.rls_user_can_access_store(r.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_purchase_receives r
      WHERE r.id = purchase_receive_id
        AND public.rls_user_can_access_store(r.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_supplier_payments_staff" ON public.erp_supplier_payments;
CREATE POLICY "erp_supplier_payments_store_access"
  ON public.erp_supplier_payments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_supplier_payment_allocations_staff" ON public.erp_supplier_payment_allocations;
CREATE POLICY "erp_supplier_payment_allocations_store_access"
  ON public.erp_supplier_payment_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_supplier_payments p
      WHERE p.id = payment_id
        AND public.rls_user_can_access_store(p.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_supplier_payments p
      WHERE p.id = payment_id
        AND public.rls_user_can_access_store(p.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_vendor_credits_staff" ON public.erp_vendor_credits;
CREATE POLICY "erp_vendor_credits_store_access"
  ON public.erp_vendor_credits FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_vendor_credit_lines_staff" ON public.erp_vendor_credit_lines;
CREATE POLICY "erp_vendor_credit_lines_store_access"
  ON public.erp_vendor_credit_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_vendor_credits vc
      WHERE vc.id = vendor_credit_id
        AND public.rls_user_can_access_store(vc.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_vendor_credits vc
      WHERE vc.id = vendor_credit_id
        AND public.rls_user_can_access_store(vc.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_vendor_credit_applications_staff" ON public.erp_vendor_credit_applications;
CREATE POLICY "erp_vendor_credit_applications_store_access"
  ON public.erp_vendor_credit_applications FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_vendor_credits vc
      WHERE vc.id = vendor_credit_id
        AND public.rls_user_can_access_store(vc.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_vendor_credits vc
      WHERE vc.id = vendor_credit_id
        AND public.rls_user_can_access_store(vc.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_expenses_staff" ON public.erp_expenses;
CREATE POLICY "erp_expenses_store_access"
  ON public.erp_expenses FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_stock_adjustments_staff" ON public.erp_stock_adjustments;
CREATE POLICY "erp_stock_adjustments_store_access"
  ON public.erp_stock_adjustments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_stock_adjustment_lines_staff" ON public.erp_stock_adjustment_lines;
CREATE POLICY "erp_stock_adjustment_lines_store_access"
  ON public.erp_stock_adjustment_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_stock_adjustments a
      WHERE a.id = adjustment_id
        AND public.rls_user_can_access_store(a.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_stock_adjustments a
      WHERE a.id = adjustment_id
        AND public.rls_user_can_access_store(a.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_transfer_requests_staff" ON public.erp_transfer_requests;
CREATE POLICY "erp_transfer_requests_store_access"
  ON public.erp_transfer_requests FOR ALL
  USING (
    public.rls_user_can_access_store(from_store_id)
    AND public.rls_user_can_access_store(to_store_id)
  )
  WITH CHECK (
    public.rls_user_can_access_store(from_store_id)
    AND public.rls_user_can_access_store(to_store_id)
  );

DROP POLICY IF EXISTS "erp_transfer_request_lines_staff" ON public.erp_transfer_request_lines;
CREATE POLICY "erp_transfer_request_lines_store_access"
  ON public.erp_transfer_request_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_transfer_requests tr
      WHERE tr.id = request_id
        AND public.rls_user_can_access_store(tr.from_store_id)
        AND public.rls_user_can_access_store(tr.to_store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_transfer_requests tr
      WHERE tr.id = request_id
        AND public.rls_user_can_access_store(tr.from_store_id)
        AND public.rls_user_can_access_store(tr.to_store_id)
    )
  );

DROP POLICY IF EXISTS "erp_store_transfers_staff" ON public.erp_store_transfers;
CREATE POLICY "erp_store_transfers_store_access"
  ON public.erp_store_transfers FOR ALL
  USING (
    public.rls_user_can_access_store(from_store_id)
    AND public.rls_user_can_access_store(to_store_id)
  )
  WITH CHECK (
    public.rls_user_can_access_store(from_store_id)
    AND public.rls_user_can_access_store(to_store_id)
  );

DROP POLICY IF EXISTS "erp_store_transfer_lines_staff" ON public.erp_store_transfer_lines;
CREATE POLICY "erp_store_transfer_lines_store_access"
  ON public.erp_store_transfer_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_store_transfers t
      WHERE t.id = transfer_id
        AND public.rls_user_can_access_store(t.from_store_id)
        AND public.rls_user_can_access_store(t.to_store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_store_transfers t
      WHERE t.id = transfer_id
        AND public.rls_user_can_access_store(t.from_store_id)
        AND public.rls_user_can_access_store(t.to_store_id)
    )
  );

DROP POLICY IF EXISTS "erp_transfer_payments_staff" ON public.erp_transfer_payments;
CREATE POLICY "erp_transfer_payments_store_access"
  ON public.erp_transfer_payments FOR ALL
  USING (
    public.rls_user_can_access_store(from_store_id)
    AND public.rls_user_can_access_store(to_store_id)
  )
  WITH CHECK (
    public.rls_user_can_access_store(from_store_id)
    AND public.rls_user_can_access_store(to_store_id)
  );

DROP POLICY IF EXISTS "journal_entries_staff" ON public.journal_entries;
CREATE POLICY "journal_entries_store_access"
  ON public.journal_entries FOR ALL
  USING (
    store_id IS NULL
    OR public.rls_user_can_access_store(store_id)
  )
  WITH CHECK (
    store_id IS NULL
    OR public.rls_user_can_access_store(store_id)
  );

DROP POLICY IF EXISTS "journal_entry_lines_staff" ON public.journal_entry_lines;
CREATE POLICY "journal_entry_lines_store_access"
  ON public.journal_entry_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries j
      WHERE j.id = journal_entry_id
        AND (
          j.store_id IS NULL
          OR public.rls_user_can_access_store(j.store_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries j
      WHERE j.id = journal_entry_id
        AND (
          j.store_id IS NULL
          OR public.rls_user_can_access_store(j.store_id)
        )
    )
  );

DROP POLICY IF EXISTS "accounts_staff_select" ON public.accounts;
DROP POLICY IF EXISTS "accounts_staff_manage" ON public.accounts;
CREATE POLICY "accounts_staff_store"
  ON public.accounts FOR ALL
  TO authenticated
  USING (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  )
  WITH CHECK (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  );

DROP POLICY IF EXISTS "audit_logs_staff_select" ON public.audit_logs;
CREATE POLICY "audit_logs_staff_store_select"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (
    public.is_staff_user()
    AND (
      store_id IS NULL
      OR public.rls_user_can_access_store(store_id)
    )
  );

DROP POLICY IF EXISTS "online_stock_transfers_staff" ON public.online_stock_transfers;
CREATE POLICY "online_stock_transfers_store_access"
  ON public.online_stock_transfers FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "online_stock_transfer_allocations_staff" ON public.online_stock_transfer_allocations;
CREATE POLICY "online_stock_transfer_allocations_store_access"
  ON public.online_stock_transfer_allocations FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.online_stock_transfers t
      WHERE t.id = transfer_id
        AND public.rls_user_can_access_store(t.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.online_stock_transfers t
      WHERE t.id = transfer_id
        AND public.rls_user_can_access_store(t.store_id)
    )
  );

DROP POLICY IF EXISTS "order_fulfillments_staff" ON public.order_fulfillments;
CREATE POLICY "order_fulfillments_store_access"
  ON public.order_fulfillments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "order_fulfillment_items_staff" ON public.order_fulfillment_items;
CREATE POLICY "order_fulfillment_items_store_access"
  ON public.order_fulfillment_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.order_fulfillments f
      WHERE f.id = fulfillment_id
        AND public.rls_user_can_access_store(f.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.order_fulfillments f
      WHERE f.id = fulfillment_id
        AND public.rls_user_can_access_store(f.store_id)
    )
  );

-- HR / VAT / assets (store-scoped)
DROP POLICY IF EXISTS "erp_employees_staff" ON public.erp_employees;
CREATE POLICY "erp_employees_store_access"
  ON public.erp_employees FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_vat_returns_staff" ON public.erp_vat_returns;
CREATE POLICY "erp_vat_returns_store_access"
  ON public.erp_vat_returns FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_vat_payments_staff" ON public.erp_vat_payments;
CREATE POLICY "erp_vat_payments_store_access"
  ON public.erp_vat_payments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_fixed_assets_staff" ON public.erp_fixed_assets;
CREATE POLICY "erp_fixed_assets_store_access"
  ON public.erp_fixed_assets FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_landed_cost_items_staff" ON public.erp_landed_cost_items;
CREATE POLICY "erp_landed_cost_items_staff"
  ON public.erp_landed_cost_items FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS "erp_account_transactions_staff" ON public.erp_account_transactions;
CREATE POLICY "erp_account_transactions_store_access"
  ON public.erp_account_transactions FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_posting_rules_staff" ON public.erp_posting_rules;
CREATE POLICY "erp_posting_rules_admin"
  ON public.erp_posting_rules FOR ALL
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "companies_staff_select" ON public.companies;
DROP POLICY IF EXISTS "companies_staff_manage" ON public.companies;
CREATE POLICY "companies_staff_select"
  ON public.companies FOR SELECT
  TO authenticated
  USING (public.is_staff_user());
CREATE POLICY "companies_admin_manage"
  ON public.companies FOR ALL
  TO authenticated
  USING (public.is_admin_user())
  WITH CHECK (public.is_admin_user());

DROP POLICY IF EXISTS "online_to_physical_transfers_staff" ON public.online_to_physical_transfers;
CREATE POLICY "online_to_physical_transfers_store_access"
  ON public.online_to_physical_transfers FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "online_to_physical_transfer_lines_staff" ON public.online_to_physical_transfer_lines;
CREATE POLICY "online_to_physical_transfer_lines_store_access"
  ON public.online_to_physical_transfer_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.online_to_physical_transfers t
      WHERE t.id = transfer_id
        AND public.rls_user_can_access_store(t.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.online_to_physical_transfers t
      WHERE t.id = transfer_id
        AND public.rls_user_can_access_store(t.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_employee_ledger_staff" ON public.erp_employee_ledger;
CREATE POLICY "erp_employee_ledger_store_access"
  ON public.erp_employee_ledger FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_employees e
      WHERE e.id = employee_id
        AND public.rls_user_can_access_store(e.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_employees e
      WHERE e.id = employee_id
        AND public.rls_user_can_access_store(e.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_salary_payments_staff" ON public.erp_salary_payments;
CREATE POLICY "erp_salary_payments_store_access"
  ON public.erp_salary_payments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_salary_bulk_payments_staff" ON public.erp_salary_bulk_payments;
CREATE POLICY "erp_salary_bulk_payments_store_access"
  ON public.erp_salary_bulk_payments FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_pay_slips_staff" ON public.erp_pay_slips;
CREATE POLICY "erp_pay_slips_store_access"
  ON public.erp_pay_slips FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_employee_opening_balance_batches_staff" ON public.erp_employee_opening_balance_batches;
CREATE POLICY "erp_employee_opening_balance_batches_store_access"
  ON public.erp_employee_opening_balance_batches FOR ALL
  USING (public.rls_user_can_access_store(store_id))
  WITH CHECK (public.rls_user_can_access_store(store_id));

DROP POLICY IF EXISTS "erp_employee_opening_balance_lines_staff" ON public.erp_employee_opening_balance_lines;
CREATE POLICY "erp_employee_opening_balance_lines_store_access"
  ON public.erp_employee_opening_balance_lines FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.erp_employee_opening_balance_batches b
      WHERE b.id = batch_id
        AND public.rls_user_can_access_store(b.store_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.erp_employee_opening_balance_batches b
      WHERE b.id = batch_id
        AND public.rls_user_can_access_store(b.store_id)
    )
  );

DROP POLICY IF EXISTS "erp_recurring_schedules_staff" ON public.erp_recurring_schedules;
CREATE POLICY "erp_recurring_schedules_store_access"
  ON public.erp_recurring_schedules FOR ALL
  USING (
    (store_id IS NOT NULL AND public.rls_user_can_access_store(store_id))
    OR (store_id IS NULL AND public.is_admin_user())
  )
  WITH CHECK (
    (store_id IS NOT NULL AND public.rls_user_can_access_store(store_id))
    OR (store_id IS NULL AND public.is_admin_user())
  );

-- Revoke direct insert on stock_movements (mutations via SECURITY DEFINER RPCs only)
REVOKE INSERT ON public.stock_movements FROM authenticated;

GRANT EXECUTE ON FUNCTION public.is_admin_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rls_user_can_access_store(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_store_access(uuid, uuid) TO authenticated;

COMMIT;
