-- Dynamic product specifications (key-value, predefined keys in app catalog).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS specs jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.specs IS
  'Selected spec key → value pairs, e.g. {"warranty":"12 Months","condition":"Brand New"}. Keys match app catalog.';

CREATE INDEX IF NOT EXISTS products_specs_gin ON public.products USING gin (specs);
