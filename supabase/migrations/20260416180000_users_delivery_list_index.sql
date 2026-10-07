-- Speeds admin delivery list: filter by role + verification + sort by created_at
CREATE INDEX IF NOT EXISTS idx_users_role_verified_created_at
  ON public.users (role, is_verified, created_at DESC);
