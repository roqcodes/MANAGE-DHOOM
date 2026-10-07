-- Simple products (no variants): ensure one sellable SKU for online inventory / cart.
-- ERP can keep product-level rows without variants; online flows call this lazily.

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_product_default_variant(p_product_id uuid)
RETURNS uuid
LANGUAGE plpgsql  
SECURITY DEFINERa
SET search_path = public
AS $$
DECLARE
  v_variant_id uuid;
  v_product record; 
BEGIN
  IF p_product_id IS NULL THEN
    RAISE EXCEPTION 'Product id is required';
  END IF;

  SELECT id
  INTO v_variant_id
  FROM public.product_variants
  WHERE product_id = p_product_id
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_variant_id IS NOT NULL THEN
    RETURN v_variant_id;
  END IF;

  SELECT
    id,
    name,
    price,
    mrp,
    barcode,
    purchase_price,
    tax_rate_percent,
    is_active
  INTO v_product
  FROM public.products
  WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  INSERT INTO public.product_variants (
    product_id,
    name,
    price,
    mrp,
    barcode,
    purchase_price,
    tax_rate_percent
  )
  VALUES (
    v_product.id,
    COALESCE(NULLIF(BTRIM(v_product.name), ''), 'Default'),
    COALESCE(v_product.price, 0),
    COALESCE(v_product.mrp, 0),
    v_product.barcode,
    v_product.purchase_price,
    COALESCE(v_product.tax_rate_percent, 0)
  )
  RETURNING id INTO v_variant_id;

  RETURN v_variant_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_product_default_variant(uuid) IS
  'Idempotent: returns existing variant or creates one default SKU from product-level fields for simple/online products.';

GRANT EXECUTE ON FUNCTION public.ensure_product_default_variant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_product_default_variant(uuid) TO anon;

COMMIT;
