-- Dynamic categories with thumbnails, hierarchy, and sort order
BEGIN;

-- ─── Table (create if missing) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  parent_id   uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  image_url   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── New columns ─────────────────────────────────────────────────────────────
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS sort_order    integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS slug          text,
  ADD COLUMN IF NOT EXISTS description   text,
  ADD COLUMN IF NOT EXISTS updated_at    timestamptz NOT NULL DEFAULT now();

-- Backfill thumbnail from existing image_url
UPDATE public.categories
SET thumbnail_url = image_url
WHERE thumbnail_url IS NULL AND image_url IS NOT NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_categories_parent_id  ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order   ON public.categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_is_active    ON public.categories(is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug) WHERE slug IS NOT NULL;

-- Full unique constraint for slug (allows multiple NULLs)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_slug_key'
  ) THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_slug_key UNIQUE (slug);
  END IF;
END $$;

-- products.category_id FK (if products table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'products_category_id_fkey'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_categories_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_categories_updated_at();

COMMENT ON COLUMN public.categories.thumbnail_url IS 'Small icon shown in category grids and sidebars';
COMMENT ON COLUMN public.categories.image_url      IS 'Optional hero/banner image for promo cards';
COMMENT ON COLUMN public.categories.sort_order     IS 'Lower numbers appear first in navigation';
COMMENT ON COLUMN public.categories.is_active      IS 'Inactive categories are hidden from storefront';

COMMIT;
