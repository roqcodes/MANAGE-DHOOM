-- ERP customers live in public.users; staff-created customers may have no auth.users row.
-- customer_credit_limits.user_id must reference public.users so DELETE/upsert from ERP works.

BEGIN;

ALTER TABLE public.customer_credit_limits
  DROP CONSTRAINT IF EXISTS customer_credit_limits_user_id_fkey;

ALTER TABLE public.customer_credit_limits
  ADD CONSTRAINT customer_credit_limits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE;

COMMIT;
