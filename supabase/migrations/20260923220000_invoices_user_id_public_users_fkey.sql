-- invoices.user_id still pointed at auth.users from the original marketplace schema,
-- but ERP customers (and orders.user_id) use public.users. Inserts/updates fail when
-- the customer exists only in public.users (admin-created ERP customers).

BEGIN;

-- Backfill public.users for any legacy invoice customers that exist in auth only.
INSERT INTO public.users (id, name, email, role, is_verified)
SELECT
  au.id,
  COALESCE(
    NULLIF(BTRIM(au.raw_user_meta_data ->> 'name'), ''),
    NULLIF(BTRIM(au.email), ''),
    'Customer'
  ),
  au.email,
  'customer'::public.user_role,
  COALESCE((au.email_confirmed_at IS NOT NULL), true)
FROM auth.users au
WHERE EXISTS (
  SELECT 1
  FROM public.invoices i
  WHERE i.user_id = au.id
)
AND NOT EXISTS (
  SELECT 1
  FROM public.users u
  WHERE u.id = au.id
);

-- Fail fast if any invoice still references a missing customer profile.
DO $$
DECLARE
  v_orphans integer;
BEGIN
  SELECT COUNT(*) INTO v_orphans
  FROM public.invoices i
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = i.user_id
  );

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Cannot repoint invoices.user_id: % invoice(s) reference missing public.users rows',
      v_orphans;
  END IF;
END $$;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_user_id_fkey;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE RESTRICT;

COMMIT;
