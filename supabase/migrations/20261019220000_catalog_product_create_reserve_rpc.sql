-- P0: Atomically reserve a product row for a catalog create operation (concurrency-safe).

BEGIN;

CREATE OR REPLACE FUNCTION public.catalog_product_create_reserve_product(
  p_operation_id uuid,
  p_name text,
  p_description text,
  p_category_id uuid,
  p_brand_id uuid,
  p_image_url text,
  p_variant_layout text,
  p_item_type text,
  p_hsn_sac text,
  p_price numeric,
  p_mrp numeric,
  p_barcode text,
  p_purchase_price numeric,
  p_tax_rate_percent numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.catalog_product_create_operations%ROWTYPE;
  v_name text;
  v_product_id uuid;
  v_layout text;
  v_item text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.is_staff_user(v_uid) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_operation_id::text));

  INSERT INTO public.catalog_product_create_operations (operation_id, created_by, status, result)
  VALUES (p_operation_id, v_uid, 'in_progress', '{}'::jsonb)
  ON CONFLICT (operation_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.catalog_product_create_operations
  WHERE operation_id = p_operation_id
  FOR UPDATE;

  IF v_row.created_by IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'This save operation cannot be resumed.';
  END IF;

  IF v_row.product_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'product_id', v_row.product_id,
      'replayed', true
    );
  END IF;

  v_name := btrim(p_name);
  IF v_name = '' THEN
    RAISE EXCEPTION 'Product name is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    WHERE lower(btrim(p.name)) = lower(v_name)
      AND btrim(p.name) <> ''
  ) THEN
    RAISE EXCEPTION 'A product with this name already exists.'
      USING ERRCODE = '23505';
  END IF;

  v_layout := COALESCE(NULLIF(btrim(p_variant_layout), ''), 'flat');
  IF v_layout NOT IN ('flat', 'grouped') THEN
    v_layout := 'flat';
  END IF;

  v_item := COALESCE(NULLIF(btrim(p_item_type), ''), 'goods');
  IF v_item NOT IN ('goods', 'service') THEN
    v_item := 'goods';
  END IF;

  INSERT INTO public.products (
    name,
    description,
    category_id,
    brand_id,
    image_url,
    variant_layout,
    item_type,
    hsn_sac,
    price,
    mrp,
    barcode,
    purchase_price,
    tax_rate_percent,
    is_active
  )
  VALUES (
    v_name,
    p_description,
    p_category_id,
    p_brand_id,
    p_image_url,
    v_layout,
    v_item,
    p_hsn_sac,
    p_price,
    p_mrp,
    p_barcode,
    p_purchase_price,
    p_tax_rate_percent,
    true
  )
  RETURNING id INTO v_product_id;

  UPDATE public.catalog_product_create_operations
  SET
    product_id = v_product_id,
    updated_at = now()
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'product_id', v_product_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.catalog_product_create_reserve_product(
  uuid, text, text, uuid, uuid, text, text, text, text, numeric, numeric, text, numeric, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.catalog_product_create_reserve_product(
  uuid, text, text, uuid, uuid, text, text, text, text, numeric, numeric, text, numeric, numeric
) TO authenticated;

COMMIT;
