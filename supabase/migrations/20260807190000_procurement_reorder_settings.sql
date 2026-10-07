-- Per-SKU procurement thresholds and order-quantity memory on central inventory.

alter table public.inventory
  add column if not exists reorder_point integer not null default 10,
  add column if not exists reorder_quantity integer not null default 10,
  add column if not exists last_reorder_quantity integer;

comment on column public.inventory.reorder_point is
  'Minimum central stock level. Procurement triggers when stock falls below this value.';
comment on column public.inventory.reorder_quantity is
  'Default quantity to order when procurement triggers (unless last_reorder_quantity is set).';
comment on column public.inventory.last_reorder_quantity is
  'Quantity from the most recent purchase order for this variant; prefills the next procurement run.';

alter table public.inventory
  drop constraint if exists inventory_reorder_point_non_negative;
alter table public.inventory
  add constraint inventory_reorder_point_non_negative check (reorder_point >= 0);

alter table public.inventory
  drop constraint if exists inventory_reorder_quantity_positive;
alter table public.inventory
  add constraint inventory_reorder_quantity_positive check (reorder_quantity > 0);

alter table public.inventory
  drop constraint if exists inventory_last_reorder_quantity_positive;
alter table public.inventory
  add constraint inventory_last_reorder_quantity_positive check (
    last_reorder_quantity is null or last_reorder_quantity > 0
  );

-- Backfill last_reorder_quantity from the most recent PO line per variant.
update public.inventory i
set last_reorder_quantity = sub.quantity
from (
  select distinct on (poi.variant_id)
    poi.variant_id,
    poi.quantity
  from public.purchase_order_items poi
  inner join public.purchase_orders po on po.id = poi.po_id
  where poi.variant_id is not null
    and poi.quantity is not null
    and poi.quantity > 0
  order by poi.variant_id, po.created_at desc
) sub
where i.variant_id = sub.variant_id;
