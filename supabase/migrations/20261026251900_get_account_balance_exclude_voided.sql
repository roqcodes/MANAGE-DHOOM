-- Exclude voided/draft journals from account balances (LEFT JOIN was still summing voided lines).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_account_balance(p_account_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  RETURN (
    SELECT
      COALESCE(a.opening_balance, 0)
      + COALESCE((
        SELECT SUM(l.debit_amount - l.credit_amount)
        FROM public.journal_entry_lines l
        INNER JOIN public.journal_entries j
          ON j.id = l.journal_entry_id
          AND j.status = 'posted'
        WHERE l.account_id = a.id
      ), 0)
    FROM public.accounts a
    WHERE a.id = p_account_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_account_balances(p_account_ids uuid[])
RETURNS TABLE(account_id uuid, balance numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    COALESCE(a.opening_balance, 0)
      + COALESCE((
        SELECT SUM(l.debit_amount - l.credit_amount)
        FROM public.journal_entry_lines l
        INNER JOIN public.journal_entries j
          ON j.id = l.journal_entry_id
          AND j.status = 'posted'
        WHERE l.account_id = a.id
      ), 0)
  FROM unnest(p_account_ids) AS ids(id)
  INNER JOIN public.accounts a ON a.id = ids.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_account_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_balances(uuid[]) TO authenticated;

COMMIT;
