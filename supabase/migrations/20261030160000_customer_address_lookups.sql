-- Reusable city / mall / street lookups for customer billing addresses.

BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_address_cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_address_cities_name_unique
  ON public.erp_address_cities (lower(trim(name)));

CREATE TABLE IF NOT EXISTS public.erp_address_malls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_address_malls_name_unique
  ON public.erp_address_malls (lower(trim(name)));

CREATE TABLE IF NOT EXISTS public.erp_address_streets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS erp_address_streets_name_unique
  ON public.erp_address_streets (lower(trim(name)));

ALTER TABLE public.addresses
  ADD COLUMN IF NOT EXISTS city_id uuid REFERENCES public.erp_address_cities (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mall_id uuid REFERENCES public.erp_address_malls (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS street_id uuid REFERENCES public.erp_address_streets (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS addresses_city_id_idx ON public.addresses (city_id);
CREATE INDEX IF NOT EXISTS addresses_mall_id_idx ON public.addresses (mall_id);
CREATE INDEX IF NOT EXISTS addresses_street_id_idx ON public.addresses (street_id);

ALTER TABLE public.erp_address_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_address_malls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_address_streets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_address_cities_staff_all ON public.erp_address_cities;
CREATE POLICY erp_address_cities_staff_all
  ON public.erp_address_cities
  FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS erp_address_malls_staff_all ON public.erp_address_malls;
CREATE POLICY erp_address_malls_staff_all
  ON public.erp_address_malls
  FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

DROP POLICY IF EXISTS erp_address_streets_staff_all ON public.erp_address_streets;
CREATE POLICY erp_address_streets_staff_all
  ON public.erp_address_streets
  FOR ALL
  TO authenticated
  USING (public.is_staff_user())
  WITH CHECK (public.is_staff_user());

COMMIT;
