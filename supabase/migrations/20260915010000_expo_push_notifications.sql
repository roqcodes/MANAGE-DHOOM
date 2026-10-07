-- Expo push tokens, customer notification preferences, and admin campaigns.

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('order', 'payment', 'inventory', 'procurement', 'system', 'return', 'promo'));

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  expo_push_token text NOT NULL UNIQUE,
  platform text NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  device_name text,
  is_active boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_tokens_user_id ON public.push_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON public.push_tokens (is_active) WHERE is_active;

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.users (id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  order_updates boolean NOT NULL DEFAULT true,
  promotions boolean NOT NULL DEFAULT true,
  wallet_updates boolean NOT NULL DEFAULT true,
  sound_enabled boolean NOT NULL DEFAULT true,
  badge_enabled boolean NOT NULL DEFAULT true,
  quiet_hours_enabled boolean NOT NULL DEFAULT false,
  quiet_hours_start time NOT NULL DEFAULT '22:00',
  quiet_hours_end time NOT NULL DEFAULT '08:00',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.push_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  topic text NOT NULL DEFAULT 'system'
    CHECK (topic IN ('order', 'promo', 'wallet', 'system')),
  audience text NOT NULL DEFAULT 'all_customers'
    CHECK (audience IN ('all_customers', 'selected')),
  href text,
  sound text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'partial', 'failed')),
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_push_campaigns_created_at ON public.push_campaigns (created_at DESC);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_own_select ON public.push_tokens;
CREATE POLICY push_tokens_own_select ON public.push_tokens
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff_user());

DROP POLICY IF EXISTS push_tokens_own_insert ON public.push_tokens;
CREATE POLICY push_tokens_own_insert ON public.push_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_own_update ON public.push_tokens;
CREATE POLICY push_tokens_own_update ON public.push_tokens
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_own_delete ON public.push_tokens;
CREATE POLICY push_tokens_own_delete ON public.push_tokens
  FOR DELETE USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_tokens_staff_update ON public.push_tokens;
CREATE POLICY push_tokens_staff_update ON public.push_tokens
  FOR UPDATE USING (public.is_staff_user());

DROP POLICY IF EXISTS notification_prefs_own_select ON public.notification_preferences;
CREATE POLICY notification_prefs_own_select ON public.notification_preferences
  FOR SELECT USING (user_id = auth.uid() OR public.is_staff_user());

DROP POLICY IF EXISTS notification_prefs_own_insert ON public.notification_preferences;
CREATE POLICY notification_prefs_own_insert ON public.notification_preferences
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_prefs_own_update ON public.notification_preferences;
CREATE POLICY notification_prefs_own_update ON public.notification_preferences
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_campaigns_staff_all ON public.push_campaigns;
CREATE POLICY push_campaigns_staff_all ON public.push_campaigns
  FOR ALL USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT, INSERT ON public.push_campaigns TO authenticated;

COMMIT;
