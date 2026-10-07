-- Seed GRNI clearing account required by purchase receive / PO deliver-finalize journals.
-- ensure_system_ledger_account('GOODS_RECEIPT_PENDING', 'Goods Receipt Pending') was a no-op
-- because the account type did not exist, causing "Account not found for journal line".

BEGIN;

INSERT INTO public.account_types (account_category, name, description, is_system)
SELECT 'Liability', 'Goods Receipt Pending', 'GRNI clearing between receive and bill finalize', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_types WHERE name = 'Goods Receipt Pending'
);

INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
SELECT t.id, 'Goods Receipt Pending', 'GRNI clearing between receive and bill finalize', 'GOODS_RECEIPT_PENDING', true, true
FROM public.account_types t
WHERE t.name = 'Goods Receipt Pending'
  AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE a.code = 'GOODS_RECEIPT_PENDING');

CREATE OR REPLACE FUNCTION public.ensure_system_ledger_account(p_code text, p_type_name text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  v_id := public.get_account_by_code(p_code);
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.accounts (account_type_id, name, description, code, is_system, is_locked)
  SELECT t.id, t.name, t.description, p_code, true, true
  FROM public.account_types t
  WHERE t.name = p_type_name
  ORDER BY t.is_system DESC
  LIMIT 1
  ON CONFLICT (code) DO NOTHING;

  v_id := public.get_account_by_code(p_code);
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'System ledger account % is missing (expected account type %)', p_code, p_type_name;
  END IF;

  RETURN v_id;
END;
$$;

COMMIT;
