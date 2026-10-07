-- Toggle MRP / discount display across admin and BuyHub.

alter table public.app_settings
  add column if not exists show_mrp boolean not null default true;

comment on column public.app_settings.show_mrp is
  'When false, MRP fields and discount percentages are hidden in admin and app.';
