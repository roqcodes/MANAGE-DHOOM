-- Idempotent catalog product create (admin product modal / quick create).

BEGIN;

CREATE TABLE IF NOT EXISTS public.catalog_product_create_operations (
  operation_id uuid PRIMARY KEY,
  created_by uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.products (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'partial')),
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS catalog_product_create_operations_product_id_idx
  ON public.catalog_product_create_operations (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS catalog_product_create_operations_created_by_idx
  ON public.catalog_product_create_operations (created_by);

ALTER TABLE public.catalog_product_create_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.catalog_product_create_operations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.catalog_product_create_operations TO authenticated;

CREATE POLICY catalog_product_create_operations_staff_select
  ON public.catalog_product_create_operations
  FOR SELECT
  TO authenticated
  USING (public.is_staff_user(auth.uid()));

CREATE POLICY catalog_product_create_operations_staff_insert
  ON public.catalog_product_create_operations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_staff_user(auth.uid())
    AND created_by = auth.uid()
  );

CREATE POLICY catalog_product_create_operations_staff_update
  ON public.catalog_product_create_operations
  FOR UPDATE
  TO authenticated
  USING (public.is_staff_user(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

COMMIT;
