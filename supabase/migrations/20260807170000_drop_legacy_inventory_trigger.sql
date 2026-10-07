-- Root cause of 2x stock decrement: a legacy trigger on `orders` (AFTER UPDATE)
-- independently deducts inventory whenever a row is updated (e.g. payment_status -> 'paid').
-- Our checkout RPC (place_customer_order) and admin services (commitOrderInventory)
-- already decrement stock explicitly and atomically. The trigger fires on TOP of that
-- every time an order row is updated afterwards (e.g. our own `payment_status = 'paid'`
-- update), causing the double decrement.
--
-- Stock changes must only ever happen through:
--   - place_customer_order() RPC (buyhub checkout)
--   - inventory_apply_order_stock() RPC (admin create/cancel order)
-- Both are idempotent via orders.inventory_committed.

drop trigger if exists trg_deduct_inventory on public.orders;

-- Combine the two order updates in checkout into one statement so future
-- triggers on `orders` (if any are re-added) can't fire twice for one checkout.
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
  v_committed boolean;
  r record;
  v_stock numeric;
  v_new numeric;
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

  for r in
    select
      (elem->>'variant_id')::uuid as variant_id,
      sum((elem->>'quantity')::int)::int as qty
    from jsonb_array_elements(p_items) as elem
    group by (elem->>'variant_id')::uuid
  loop
    if r.variant_id is null or r.qty is null or r.qty <= 0 then
      raise exception 'Invalid line item';
    end if;

    select stock into v_stock
    from public.inventory
    where variant_id = r.variant_id
    for update;

    if coalesce(v_stock, 0) < r.qty then
      raise exception 'Not enough stock in central warehouse';
    end if;
  end loop;

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

  select inventory_committed
  into v_committed
  from public.orders
  where id = v_order_id
  for update;

  if coalesce(v_committed, false) then
    raise exception 'Stock already committed for this order';
  end if;

  for r in
    select
      oi.variant_id,
      sum(oi.quantity)::numeric as qty
    from public.order_items oi
    where oi.order_id = v_order_id
      and oi.variant_id is not null
    group by oi.variant_id
  loop
    select stock into v_stock
    from public.inventory
    where variant_id = r.variant_id
    for update;

    if not found then
      raise exception 'No inventory row for variant %', r.variant_id;
    end if;

    v_new := greatest(0, coalesce(v_stock, 0) - r.qty);

    update public.inventory
    set stock = v_new,
        updated_at = now()
    where variant_id = r.variant_id;
  end loop;

  perform public.wallet_debit(v_grand_total, 'Order ' || v_order_id::text);

  -- Single UPDATE on orders (was two) so any future trigger only fires once.
  update public.orders
  set inventory_committed = true,
      payment_status = 'paid'
  where id = v_order_id;

  delete from public.cart_items
  where cart_id in (
    select id from public.carts where user_id = v_uid
  );

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
