-- Fix: user_role enum may not include 'manager' — compare as text to avoid 22P02 on checkout.

create or replace function public.wallet_credit_user(
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
    raise exception 'Invalid refund amount';
  end if;

  update public.wallet
  set balance = balance + p_amount,
      updated_at = now()
  where user_id = p_user_id;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    insert into public.wallet (user_id, balance)
    values (p_user_id, p_amount);
  end if;

  select balance into v_balance
  from public.wallet
  where user_id = p_user_id;

  insert into public.transactions (user_id, amount, type, reference)
  values (p_user_id, p_amount, 'credit', p_reference);

  return coalesce(v_balance, 0);
end;
$$;

create or replace function public.inventory_apply_order_stock(
  p_order_id uuid,
  p_multiplier integer default -1
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order_user uuid;
  v_is_staff boolean;
  r record;
  v_stock numeric;
  v_new numeric;
  v_delta numeric;
begin
  if p_order_id is null then
    raise exception 'Order id is required';
  end if;

  if p_multiplier not in (-1, 1) then
    raise exception 'Invalid stock multiplier';
  end if;

  select user_id into v_order_user
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found';
  end if;

  v_is_staff := exists (
    select 1
    from public.users
    where id = v_uid
      and role::text in ('admin', 'manager')
  );

  if not v_is_staff and (v_uid is null or v_uid <> v_order_user) then
    raise exception 'Forbidden';
  end if;

  for r in
    select
      oi.variant_id,
      sum(oi.quantity)::numeric as qty
    from public.order_items oi
    where oi.order_id = p_order_id
      and oi.variant_id is not null
    group by oi.variant_id
  loop
    if r.qty is null or r.qty <= 0 then
      continue;
    end if;

    v_delta := r.qty * p_multiplier;

    select stock into v_stock
    from public.inventory
    where variant_id = r.variant_id
    for update;

    if not found then
      if v_delta < 0 then
        raise exception 'No inventory row for variant %', r.variant_id;
      end if;

      insert into public.inventory (variant_id, stock, updated_at)
      values (r.variant_id, v_delta, now());
      continue;
    end if;

    v_new := greatest(0, coalesce(v_stock, 0) + v_delta);

    update public.inventory
    set stock = v_new,
        updated_at = now()
    where variant_id = r.variant_id;
  end loop;
end;
$$;
