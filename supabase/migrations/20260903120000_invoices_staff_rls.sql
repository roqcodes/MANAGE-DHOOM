-- ERP admin must read/write customer invoices and line items (staff RLS was missing).

BEGIN;

CREATE POLICY "invoices_staff"
  ON public.invoices
  FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

CREATE POLICY "invoice_items_staff"
  ON public.invoice_items
  FOR ALL
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

COMMIT;
