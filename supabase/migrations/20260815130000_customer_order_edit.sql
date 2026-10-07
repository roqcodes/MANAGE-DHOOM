-- Customer order edits: tracking columns + atomic edit RPC.

alter table public.orders
  add column if not exists customer_edited_at timestamptz;

comment on column public.orders.customer_edited_at is
  'Timestamp when the customer last edited this order; clears when admin confirms (processing).';

alter table public.order_items
  add column if not exists customer_edit_flag text;

alter table public.order_items
  drop constraint if exists order_items_customer_edit_flag_check;

alter table public.order_items
  add constraint order_items_customer_edit_flag_check
  check (customer_edit_flag is null or customer_edit_flag in ('added', 'modified'));

comment on column public.order_items.customer_edit_flag is
  'Set on customer edit: added = new line, modified = quantity changed on existing variant.';

create or replace function public.customer_edit_order(
  p_order_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_old_total numeric;
  v_new_total numeric := 0;
  v_diff numeric;
  v_balance numeric;
  v_committed boolean;
  v_capture_payments boolean := true;
  v_was_paid boolean;
  r_old record;
  v_flag text;
  v_order_json jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_order_id is null then
    raise exception 'Order id is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Order must have at least one item';
  end if;

  select
    o.id,
    o.user_id,
    o.status,
    o.payment_status,
    o.total_amount,
    o.inventory_committed
  into v_order
  from public.orders o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if v_order.user_id is distinct from v_uid then
    raise exception 'Forbidden';
  end if;

  if v_order.status in ('shipped', 'delivered', 'cancelled') then
    raise exception 'This order can no longer be edited';
  end if;

  if v_order.payment_status = 'refunded' then
    raise exception 'This order can no longer be edited';
  end if;

  v_old_total := coalesce(v_order.total_amount, 0);
  v_committed := coalesce(v_order.inventory_committed, false);
  v_was_paid := v_order.payment_status = 'paid';

  select coalesce(sum((elem->>'final_price')::numeric * (elem->>'quantity')::numeric), 0)
  into v_new_total
  from jsonb_array_elements(p_items) as elem;

  if v_new_total is null or v_new_total <= 0 then
    raise exception 'Invalid order total';
  end if;

  v_new_total := round(v_new_total, 2);
  v_diff := round(v_new_total - v_old_total, 2);

  select coalesce(capture_payments, true)
  into v_capture_payments
  from public.app_settings
  where id = 1;

  if v_capture_payments and v_was_paid and v_diff > 0 then
    select balance
    into v_balance
    from public.wallet
    where user_id = v_uid
    for update;

    if not found or coalesce(v_balance, 0) < v_diff then
      raise exception 'Insufficient wallet balance for order update';
    end if;
  end if;

  if v_committed then
    perform public.inventory_apply_order_stock(p_order_id, 1);
  end if;

  create temp table _old_order_items on commit drop as
  select variant_id, quantity::int as quantity
  from public.order_items
  where order_id = p_order_id
    and variant_id is not null;

  delete from public.order_items where order_id = p_order_id;

  for r_old in
    select
      (elem->>'variant_id')::uuid as variant_id,
      sum((elem->>'quantity')::int)::int as quantity,
      max((elem->>'final_price')::numeric) as final_price,
      nullif(max(elem->>'vendor_id'), '')::uuid as vendor_id,
      max((elem->>'base_price')::numeric) as base_price,
      max((elem->>'margin_amount')::numeric) as margin_amount,
      max(elem->>'product_name') as product_name
    from jsonb_array_elements(p_items) as elem
    group by (elem->>'variant_id')::uuid
  loop
    select case
      when not exists (
        select 1 from _old_order_items o where o.variant_id = r_old.variant_id
      ) then 'added'
      when exists (
        select 1 from _old_order_items o
        where o.variant_id = r_old.variant_id
          and o.quantity is distinct from r_old.quantity
      ) then 'modified'
      else null
    end
    into v_flag;

    insert into public.order_items (
      order_id,
      variant_id,
      quantity,
      price,
      vendor_id,
      base_price,
      final_price,
      margin_amount,
      product_name,
      customer_edit_flag
    )
    values (
      p_order_id,
      r_old.variant_id,
      r_old.quantity,
      r_old.final_price,
      r_old.vendor_id,
      r_old.base_price,
      r_old.final_price,
      r_old.margin_amount,
      r_old.product_name,
      v_flag
    );
  end loop;

  perform public.inventory_apply_order_stock(p_order_id, -1);

  if v_capture_payments and v_was_paid then
    if v_diff > 0 then
      perform public.wallet_debit(v_diff, 'Order edit ' || p_order_id::text);
    elsif v_diff < 0 then
      update public.wallet
      set balance = balance + abs(v_diff),
          updated_at = now()
      where user_id = v_uid;

      insert into public.transactions (user_id, amount, type, reference)
      values (v_uid, abs(v_diff), 'credit', 'Order edit ' || p_order_id::text);
    end if;
  end if;

  update public.orders
  set
    total_amount = v_new_total,
    subtotal = v_new_total,
    tax = 0,
    discount = 0,
    status = 'pending',
    customer_edited_at = now()
  where id = p_order_id;

  select to_jsonb(o)
  into v_order_json
  from public.orders o
  where o.id = p_order_id;

  return v_order_json;
end;
$$;

grant execute on function public.customer_edit_order(uuid, jsonb) to authenticated;
