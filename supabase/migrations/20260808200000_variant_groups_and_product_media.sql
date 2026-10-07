-- Variant groups, product-level media gallery, variant layout mode

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_layout text NOT NULL DEFAULT 'flat'
  CHECK (variant_layout IN ('flat', 'grouped'));

CREATE TABLE IF NOT EXISTS public.variant_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_variant_groups_product
  ON public.variant_groups (product_id, sort_order);

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS variant_group_id uuid
  REFERENCES public.variant_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_product_variants_group
  ON public.product_variants (variant_group_id);

CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_preview boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_images_product
  ON public.product_images (product_id, sort_order);

CREATE UNIQUE INDEX IF NOT EXISTS uq_product_images_one_preview
  ON public.product_images (product_id)
  WHERE is_preview;

CREATE TABLE IF NOT EXISTS public.product_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_videos_product
  ON public.product_videos (product_id, sort_order);

ALTER TABLE public.variant_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view variant groups"
  ON public.variant_groups FOR SELECT
  USING (true);

CREATE POLICY "Admins and managers manage variant groups"
  ON public.variant_groups FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Public can view product images"
  ON public.product_images FOR SELECT
  USING (true);

CREATE POLICY "Admins and managers manage product images"
  ON public.product_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

CREATE POLICY "Public can view product videos"
  ON public.product_videos FOR SELECT
  USING (true);

CREATE POLICY "Admins and managers manage product videos"
  ON public.product_videos FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid() AND role IN ('admin', 'manager')
    )
  );

COMMIT;
