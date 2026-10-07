-- Global procurement defaults (singleton row).

create table if not exists public.procurement_settings (
  id integer primary key default 1,
  default_reorder_point integer not null default 10,
  default_reorder_quantity integer not null default 10,
  updated_at timestamp without time zone default now(),
  constraint procurement_settings_singleton check (id = 1),
  constraint procurement_settings_reorder_point_non_negative check (default_reorder_point >= 0),
  constraint procurement_settings_reorder_quantity_positive check (default_reorder_quantity > 0)
);

insert into public.procurement_settings (id, default_reorder_point, default_reorder_quantity)
values (1, 10, 10)
on conflict (id) do nothing;

comment on table public.procurement_settings is
  'Singleton defaults for procurement min threshold and order batch size.';
comment on column public.procurement_settings.default_reorder_point is
  'Default minimum stock threshold applied to new inventory SKUs.';
comment on column public.procurement_settings.default_reorder_quantity is
  'Default order batch size applied to new inventory SKUs.';
