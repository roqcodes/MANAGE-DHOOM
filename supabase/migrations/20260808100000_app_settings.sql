-- Global app settings (singleton row): country and currency preferences.

create table if not exists public.app_settings (
  id integer primary key default 1,
  country_code text not null default 'IN',
  country_name text not null default 'India',
  currency_code text not null default 'INR',
  currency_symbol text not null default '₹',
  locale text not null default 'en-IN',
  updated_at timestamp without time zone default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (
  id,
  country_code,
  country_name,
  currency_code,
  currency_symbol,
  locale
)
values (1, 'IN', 'India', 'INR', '₹', 'en-IN')
on conflict (id) do nothing;

comment on table public.app_settings is
  'Singleton store preferences: country, currency, and display locale.';
comment on column public.app_settings.country_code is 'ISO 3166-1 alpha-2 country code.';
comment on column public.app_settings.currency_code is 'ISO 4217 currency code.';
comment on column public.app_settings.currency_symbol is 'Display symbol for prices across admin and app.';
comment on column public.app_settings.locale is 'Intl locale for number formatting.';

alter table public.app_settings enable row level security;

create policy "app_settings_select_public"
  on public.app_settings
  for select
  using (true);

create policy "app_settings_update_admin"
  on public.app_settings
  for update
  using (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager')
    )
  );

create policy "app_settings_insert_admin"
  on public.app_settings
  for insert
  with check (
    exists (
      select 1
      from public.users u
      where u.id = auth.uid()
        and u.role in ('admin', 'manager')
    )
  );
