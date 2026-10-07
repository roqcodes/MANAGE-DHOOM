-- Tax Rates table
-- GST/tax configuration for products and invoices

BEGIN;

CREATE TABLE IF NOT EXISTS public.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, -- e.g., "GST 18%", "GST 12%", "GST 0%"
  rate_percent numeric(5,2) NOT NULL,
  description text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_tax_rates_default ON tax_rates(is_default) WHERE is_default = true;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tax_rates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tax_rates_updated_at_trigger
  BEFORE UPDATE ON public.tax_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_tax_rates_updated_at();

-- Function to get default tax rate
CREATE OR REPLACE FUNCTION get_default_tax_rate()
RETURNS numeric AS $$
DECLARE
  v_rate numeric;
BEGIN
  SELECT rate_percent INTO v_rate
  FROM tax_rates
  WHERE is_default = true
  LIMIT 1;

  RETURN v_rate;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to calculate tax amount
CREATE OR REPLACE FUNCTION calculate_tax(
  p_amount numeric,
  p_rate_percent numeric
)
RETURNS numeric AS $$
BEGIN
  RETURN ROUND((p_amount * p_rate_percent / 100), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Insert default GST rates
INSERT INTO tax_rates (name, rate_percent, description, is_default) VALUES
  ('GST 18%', 18.00, 'Standard GST rate', true),
  ('GST 12%', 12.00, 'Reduced GST rate', false),
  ('GST 5%', 5.00, 'Essential items GST rate', false),
  ('GST 0%', 0.00, 'Exempt/Zero-rated items', false)
ON CONFLICT DO NOTHING;

COMMIT;
