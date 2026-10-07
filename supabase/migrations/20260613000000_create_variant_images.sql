-- Variant images
-- A product variant can have many images; exactly one may be the preview.

BEGIN;

CREATE TABLE IF NOT EXISTS public.variant_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  url text NOT NULL,
  is_preview boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Fast lookup of a variant's images, ordered.
CREATE INDEX IF NOT EXISTS idx_variant_images_variant
  ON public.variant_images (variant_id, sort_order);

-- At most one preview image per variant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_variant_images_one_preview
  ON public.variant_images (variant_id)
  WHERE is_preview;

ALTER TABLE public.variant_images ENABLE ROW LEVEL SECURITY;

-- Storefront / public clients can read variant images.
CREATE POLICY "Public can view variant images"
  ON public.variant_images FOR SELECT
  USING (true);

-- Admins and managers manage variant images.
CREATE POLICY "Admins and managers manage variant images"
  ON public.variant_images FOR ALL
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
