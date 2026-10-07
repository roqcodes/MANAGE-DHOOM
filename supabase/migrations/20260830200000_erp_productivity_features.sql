-- Store branding, attachments, billable expenses, recurring schedules

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS logo_url text;

ALTER TABLE public.erp_expenses
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billable_customer_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billed_invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS attachment_url text;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS attachment_url text;

ALTER TABLE public.erp_purchase_bills 
  ADD COLUMN IF NOT EXISTS attachment_url text;

ALTER TABLE public.erp_customer_payments
  ADD COLUMN IF NOT EXISTS attachment_url text;

ALTER TABLE public.erp_supplier_payments
  ADD COLUMN IF NOT EXISTS attachment_url text;

CREATE INDEX IF NOT EXISTS erp_expenses_billable_idx
  ON public.erp_expenses (is_billable, billable_customer_id)
  WHERE is_billable = true AND billed_invoice_id IS NULL;

CREATE TABLE IF NOT EXISTS public.erp_recurring_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_type text NOT NULL CHECK (schedule_type IN ('invoice', 'purchase_bill')),
  name text NOT NULL,
  store_id uuid REFERENCES public.stores (id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  vendor_id uuid REFERENCES public.vendors (id) ON DELETE SET NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
  next_run_date date NOT NULL,
  last_run_date date,
  is_active boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_recurring_schedules_next_run_idx
  ON public.erp_recurring_schedules (next_run_date)
  WHERE is_active = true;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS orders_invoice_id_idx ON public.orders (invoice_id) WHERE invoice_id IS NOT NULL;

ALTER TABLE public.erp_recurring_schedules ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'erp_recurring_schedules'
      AND policyname = 'erp_recurring_schedules_staff'
  ) THEN
    CREATE POLICY "erp_recurring_schedules_staff"
      ON public.erp_recurring_schedules FOR ALL
      TO authenticated
      USING (public.is_staff_user(auth.uid()))
      WITH CHECK (public.is_staff_user(auth.uid()));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.erp_recurring_schedules TO authenticated;