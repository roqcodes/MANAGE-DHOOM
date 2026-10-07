-- Toggle wallet checkout on/off. When off, orders are placed without payment capture.
alter table public.app_settings
  add column if not exists capture_payments boolean not null default true;

comment on column public.app_settings.capture_payments is
  'When true, customers pay via wallet at checkout. When false, orders are placed without payment.';
