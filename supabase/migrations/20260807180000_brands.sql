-- Product brands with logo, slug, and product assignment
BEGIN;

CREATE TABLE IF NOT EXISTS public.brands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  logo_url     text,
  image_url    text,
  sort_order   integer NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  slug         text,
  description  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brands_sort_order ON public.brands(sort_order);
CREATE INDEX IF NOT EXISTS idx_brands_is_active  ON public.brands(is_active);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'brands_slug_key'
  ) THEN
    ALTER TABLE public.brands ADD CONSTRAINT brands_slug_key UNIQUE (slug);
  END IF;
END $$;

-- products.brand_id FK
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'brand_id'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_products_brand_id ON public.products(brand_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_brands_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_brands_updated_at ON public.brands;
CREATE TRIGGER trg_brands_updated_at
  BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.set_brands_updated_at();

COMMENT ON TABLE public.brands IS 'Product manufacturers / brand labels for catalog filtering';
COMMENT ON COLUMN public.brands.logo_url  IS 'Small logo shown on product cards and brand grids';
COMMENT ON COLUMN public.brands.image_url   IS 'Optional hero/banner for brand pages';
COMMENT ON COLUMN public.brands.sort_order  IS 'Lower numbers appear first in navigation';
COMMENT ON COLUMN public.brands.is_active     IS 'Inactive brands are hidden from storefront';

COMMIT;
