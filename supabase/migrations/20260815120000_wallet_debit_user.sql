-- Staff-initiated wallet debit (e.g. order edit price increase on a paid order).

create or replace function public.wallet_debit_user(
  p_user_id uuid,
  p_amount numeric,
  p_reference text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric;
  v_rows int;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1
    from public.users
    where id = auth.uid()
      and role::text in ('admin', 'manager')
  ) then
    raise exception 'Forbidden';
  end if;

  if p_user_id is null or p_amount is null or p_amount <= 0 then
    raise exception 'Invalid debit amount';
  end if;

  update public.wallet
  set balance = balance - p_amount,
      updated_at = now()
  where user_id = p_user_id
    and balance >= p_amount;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    raise exception 'Insufficient wallet balance';
  end if;

  select balance into v_balance
  from public.wallet
  where user_id = p_user_id;

  insert into public.transactions (user_id, amount, type, reference)
  values (p_user_id, p_amount, 'debit', p_reference);

  return coalesce(v_balance, 0);
end;
$$;

grant execute on function public.wallet_debit_user(uuid, numeric, text) to authenticated;
