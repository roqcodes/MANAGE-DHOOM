-- Wallet and transactions tables for B2B wholesale marketplace
-- Run in Supabase SQL Editor or as migration

BEGIN;

-- Wallet table (one per user)
CREATE TABLE IF NOT EXISTS public.wallet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  balance numeric NOT NULL DEFAULT 0 CHECK (balance >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_user_id ON public.wallet(user_id);

-- Transactions table (audit trail for all wallet movements)
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  type text NOT NULL CHECK (type IN ('credit', 'debit')),
  reference text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX idx_transactions_type ON public.transactions(user_id, type);
CREATE INDEX idx_transactions_created_at ON public.transactions(user_id, created_at DESC);

-- Function: Get wallet balance for user
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance numeric;
BEGIN
  SELECT balance INTO v_balance FROM public.wallet WHERE user_id = p_user_id;
  RETURN COALESCE(v_balance, 0);
END;
$$;

-- Function: Get transactions for user
CREATE OR REPLACE FUNCTION public.get_transactions_for_user(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', t.id,
          'user_id', t.user_id,
          'amount', t.amount,
          'type', t.type,
          'reference', t.reference,
          'created_at', t.created_at
        ) ORDER BY t.created_at DESC
      )
      FROM public.transactions t
      WHERE t.user_id = p_user_id
      LIMIT p_limit OFFSET p_offset
    ),
    '[]'::json
  );
END;
$$;

-- Function: Get transaction count for user
CREATE OR REPLACE FUNCTION public.get_transactions_count(p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.transactions WHERE user_id = p_user_id;
  RETURN v_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transactions_for_user(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_transactions_count(uuid) TO authenticated;

-- Row Level Security
ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own wallet
CREATE POLICY "Users can view own wallet"
  ON public.wallet FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own wallet"
  ON public.wallet FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own wallet"
  ON public.wallet FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: Users can only see their own transactions
CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

COMMIT;
