-- Admin policies to view all wallets and transactions

BEGIN;

CREATE POLICY "Admins can view all wallets"
  ON public.wallet FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

COMMIT;
