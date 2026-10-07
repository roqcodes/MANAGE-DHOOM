-- Atomic customer checkout: order + items + stock + wallet debit in one transaction.
-- Requires 20260807140000_order_inventory_committed.sql (inventory_committed column).

create or replace function public.place_customer_order(
  p_address_id uuid,
  p_items jsonb,
  p_merchant_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order_id uuid;
  v_grand_total numeric := 0;
  v_balance numeric;
  v_note text;
  v_order jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_address_id is null then
    raise exception 'Delivery address is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty';
  end if;

  -- One checkout at a time per user (prevents double-tap races).
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

  if not exists (
    select 1
    from public.addresses
    where id = p_address_id
      and user_id = v_uid
  ) then
    raise exception 'Selected delivery address was not found';
  end if;

  v_note := nullif(trim(coalesce(p_merchant_note, '')), '');

  select coalesce(sum((elem->>'final_price')::numeric * (elem->>'quantity')::numeric), 0)
  into v_grand_total
  from jsonb_array_elements(p_items) as elem;

  if v_grand_total is null or v_grand_total <= 0 then
    raise exception 'Invalid order total';
  end if;

  select balance
  into v_balance
  from public.wallet
  where user_id = v_uid
  for update;

  if not found then
    raise exception 'Wallet not found';
  end if;

  if v_balance < v_grand_total then
    raise exception 'Insufficient wallet balance';
  end if;

  insert into public.orders (
    user_id,
    address_id,
    total_amount,
    status,
    payment_status,
    merchant_note,
    inventory_committed
  )
  values (
    v_uid,
    p_address_id,
    round(v_grand_total, 2),
    'pending',
    'pending',
    v_note,
    false
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    variant_id,
    quantity,
    price,
    vendor_id,
    base_price,
    final_price,
    margin_amount,
    product_name
  )
  select
    v_order_id,
    (elem->>'variant_id')::uuid,
    sum((elem->>'quantity')::int)::int,
    max((elem->>'final_price')::numeric),
    nullif(max(elem->>'vendor_id'), '')::uuid,
    max((elem->>'base_price')::numeric),
    max((elem->>'final_price')::numeric),
    max((elem->>'margin_amount')::numeric),
    max(elem->>'product_name')
  from jsonb_array_elements(p_items) as elem
  group by (elem->>'variant_id')::uuid;

  perform public.inventory_apply_order_stock(v_order_id, -1);

  perform public.wallet_debit(v_grand_total, 'Order ' || v_order_id::text);

  update public.orders
  set payment_status = 'paid'
  where id = v_order_id;

  select to_jsonb(o)
  into v_order
  from public.orders o
  where o.id = v_order_id;

  if v_order is null or (v_order->>'address_id') is null then
    raise exception 'Could not save delivery address on order';
  end if;

  return v_order;
end;
$$;

grant execute on function public.place_customer_order(uuid, jsonb, text) to authenticated;
