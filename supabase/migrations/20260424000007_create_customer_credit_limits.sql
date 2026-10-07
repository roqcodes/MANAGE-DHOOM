-- Customer Credit Limits table
-- B2B credit management for wholesale customers

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_credit_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  credit_limit numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_customer_credit_user_id ON customer_credit_limits(user_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_customer_credit_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_customer_credit_limits_updated_at_trigger
  BEFORE UPDATE ON public.customer_credit_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_customer_credit_limits_updated_at();

-- Function to get available credit for a user
CREATE OR REPLACE FUNCTION get_available_credit(p_user_id uuid)
RETURNS numeric AS $$
DECLARE
  v_credit_limit numeric;
  v_outstanding numeric;
BEGIN
  -- Get credit limit
  SELECT credit_limit INTO v_credit_limit
  FROM customer_credit_limits
  WHERE user_id = p_user_id;

  IF v_credit_limit IS NULL THEN
    RETURN 0;
  END IF;

  -- Calculate outstanding balance from unpaid invoices
  SELECT COALESCE(SUM(total_amount), 0) INTO v_outstanding
  FROM invoices
  WHERE user_id = p_user_id
    AND status IN ('pending', 'partial');

  RETURN v_credit_limit - v_outstanding;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if order would exceed credit limit
CREATE OR REPLACE FUNCTION check_credit_limit(
  p_user_id uuid,
  p_order_amount numeric
)
RETURNS boolean AS $$
DECLARE
  v_available numeric;
BEGIN
  v_available := get_available_credit(p_user_id);
  RETURN v_available >= p_order_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
