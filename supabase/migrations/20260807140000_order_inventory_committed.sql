-- Prevent double stock apply on the same order (e.g. double-tap checkout).

alter table public.orders
  add column if not exists inventory_committed boolean not null default false;

comment on column public.orders.inventory_committed is
  'True after central inventory has been decremented for this order; cleared on cancel restore.';

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
  v_committed boolean;
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

  select user_id, inventory_committed
  into v_order_user, v_committed
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if p_multiplier = -1 and v_committed then
    return;
  end if;

  if p_multiplier = 1 and not v_committed then
    return;
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

  update public.orders
  set inventory_committed = (p_multiplier = -1)
  where id = p_order_id;
end;
$$;
