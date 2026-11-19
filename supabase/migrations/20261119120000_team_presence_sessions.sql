-- Team presence + login/logout history.
--
-- Live "who is online" is handled primarily by Supabase Realtime Presence
-- (in-memory, zero DB writes). This table stores the robust audit trail:
--   * 1 insert when the first tab of a browser session starts
--   * Periodic lightweight heartbeats to keep `last_seen_at` fresh
--   * 1 update when the last tab closes or user signs out
--   * Automatic reconciliation of stale sessions (crashes, closed lids, dropped beacons)
--
-- All previous orphaned sessions are automatically closed with their proper
-- logout timestamp on query and heartbeat.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  session_key text NOT NULL,
  login_at timestamptz NOT NULL DEFAULT now(),
  logout_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ended_reason text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A browser session remains one history row, while each tab has its own start
-- generation so a delayed close can only end the tab generation that sent it.
CREATE TABLE IF NOT EXISTS public.user_session_tabs (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  session_key text NOT NULL,
  tab_id text NOT NULL,
  generation_id text NOT NULL,
  started_at timestamptz NOT NULL,
  logout_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, session_key, tab_id, generation_id)
);

CREATE INDEX IF NOT EXISTS user_session_tabs_open_idx
  ON public.user_session_tabs (user_id, session_key)
  WHERE logout_at IS NULL;

DO $$
BEGIN
  ALTER TABLE public.user_sessions
    DROP CONSTRAINT IF EXISTS user_sessions_ended_reason_check;

  ALTER TABLE public.user_sessions
    ADD CONSTRAINT user_sessions_ended_reason_check
    CHECK (
      ended_reason IS NULL
      OR ended_reason IN ('sign_out', 'last_tab_closed', 'stale', 'timeout')
    );
END;
$$;

COMMENT ON TABLE public.user_sessions IS
  'Admin portal login/logout history. Live presence lives in Supabase Realtime and is reconciled into this table.';

CREATE INDEX IF NOT EXISTS user_sessions_login_at_idx
  ON public.user_sessions (login_at DESC);

CREATE INDEX IF NOT EXISTS user_sessions_user_login_idx
  ON public.user_sessions (user_id, login_at DESC);

CREATE INDEX IF NOT EXISTS user_sessions_open_lookup_idx
  ON public.user_sessions (user_id, session_key)
  WHERE logout_at IS NULL;

CREATE INDEX IF NOT EXISTS user_sessions_stale_reconcile_idx
  ON public.user_sessions (last_seen_at)
  WHERE logout_at IS NULL;

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_session_tabs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sessions_staff_select" ON public.user_sessions;
CREATE POLICY "user_sessions_staff_select"
  ON public.user_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_staff_user());

/*
 * Reconciles open sessions that have had no heartbeat activity for longer than
 * the stale threshold (default 3 minutes). This ensures that abrupt crashes,
 * closed tabs without beacons, and sleeping laptops are cleanly closed with an
 * accurate logout timestamp (set to their last_seen_at).
 */
CREATE OR REPLACE FUNCTION public.reconcile_stale_presence_sessions(
  p_stale_interval interval DEFAULT interval '3 minutes'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := clock_timestamp() - p_stale_interval;
  v_closed_count integer := 0;
BEGIN
  -- Close orphaned tab generations older than the cutoff
  UPDATE public.user_session_tabs
  SET logout_at = v_cutoff
  WHERE logout_at IS NULL
    AND started_at < v_cutoff;

  -- Close stale sessions setting logout_at to the last recorded heartbeat
  WITH updated AS (
    UPDATE public.user_sessions
    SET logout_at = last_seen_at,
        ended_reason = 'stale'
    WHERE logout_at IS NULL
      AND last_seen_at < v_cutoff
    RETURNING id
  )
  SELECT count(*) INTO v_closed_count FROM updated;

  RETURN v_closed_count;
END;
$$;

/*
 * Lightweight heartbeat ping. Called by active browser tabs periodically
 * (e.g. every 60s) to keep `last_seen_at` fresh. Zero table locks.
 */
CREATE OR REPLACE FUNCTION public.ping_presence_session(
  p_session_key text,
  p_tab_id text DEFAULT NULL,
  p_generation_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_updated boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_session_key IS NULL OR length(p_session_key) < 8 THEN
    RETURN false;
  END IF;

  UPDATE public.user_sessions
  SET last_seen_at = v_now
  WHERE user_id = v_user_id
    AND session_key = p_session_key
    AND logout_at IS NULL;

  v_updated := FOUND;

  IF v_updated AND p_tab_id IS NOT NULL AND p_generation_id IS NOT NULL THEN
    UPDATE public.user_session_tabs
    SET logout_at = NULL
    WHERE user_id = v_user_id
      AND session_key = p_session_key
      AND tab_id = p_tab_id
      AND generation_id = p_generation_id;
  END IF;

  RETURN v_updated;
END;
$$;

/*
 * Starts or re-attaches to a presence session. Reconciles stale sessions first.
 */
CREATE OR REPLACE FUNCTION public.start_presence_session(
  p_session_key text,
  p_user_agent text,
  p_tab_id text,
  p_generation_id text
)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_started_at timestamptz;
  v_existing_started_at timestamptz;
  v_existing_logout_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_session_key IS NULL OR length(p_session_key) < 8
     OR p_tab_id IS NULL OR length(p_tab_id) < 8 OR length(p_tab_id) > 128
     OR p_generation_id IS NULL OR length(p_generation_id) < 8 OR length(p_generation_id) > 128 THEN
    RAISE EXCEPTION 'invalid_session_key' USING ERRCODE = '22023';
  END IF;

  -- Reconcile any abandoned sessions before registering a new one
  PERFORM public.reconcile_stale_presence_sessions(interval '3 minutes');

  -- Serialize concurrent starts for the same browser key
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_session_key, 0)
  );

  v_started_at := clock_timestamp();

  -- Idempotency check for the same tab generation
  SELECT t.started_at, t.logout_at
  INTO v_existing_started_at, v_existing_logout_at
  FROM public.user_session_tabs t
  WHERE t.user_id = v_user_id
    AND t.session_key = p_session_key
    AND t.tab_id = p_tab_id
    AND t.generation_id = p_generation_id;

  IF FOUND THEN
    -- If tab exists and session is still open, ensure last_seen_at is refreshed
    UPDATE public.user_sessions
    SET last_seen_at = v_started_at
    WHERE user_id = v_user_id
      AND session_key = p_session_key
      AND logout_at IS NULL;

    RETURN v_existing_started_at;
  END IF;

  -- Reuse an existing open row for this browser session, or reopen one
  -- that was closed by a last_tab_closed beacon within the last 30 seconds (page reload).
  SELECT s.id
  INTO v_session_id
  FROM public.user_sessions s
  WHERE s.user_id = v_user_id
    AND s.session_key = p_session_key
    AND (
      s.logout_at IS NULL
      OR (
        s.ended_reason = 'last_tab_closed'
        AND s.logout_at > v_started_at - interval '30 seconds'
      )
    )
  ORDER BY (s.logout_at IS NULL) DESC, s.login_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    UPDATE public.user_sessions
    SET logout_at = NULL,
        ended_reason = NULL,
        last_seen_at = v_started_at,
        user_agent = COALESCE(p_user_agent, user_agent)
    WHERE id = v_session_id;
  ELSE
    INSERT INTO public.user_sessions (
      user_id,
      session_key,
      user_agent,
      login_at,
      last_seen_at
    )
    VALUES (
      v_user_id,
      p_session_key,
      p_user_agent,
      v_started_at,
      v_started_at
    )
    RETURNING id INTO v_session_id;
  END IF;

  INSERT INTO public.user_session_tabs (
    user_id,
    session_key,
    tab_id,
    generation_id,
    started_at
  )
  VALUES (v_user_id, p_session_key, p_tab_id, p_generation_id, v_started_at)
  ON CONFLICT (user_id, session_key, tab_id, generation_id)
  DO UPDATE SET logout_at = NULL;

  RETURN v_started_at;
END;
$$;

/*
 * Ends a presence session or single tab.
 * When reason is 'sign_out', closes all open sessions for the authenticated user.
 */
CREATE OR REPLACE FUNCTION public.end_presence_session(
  p_session_key text,
  p_reason text DEFAULT 'last_tab_closed',
  p_started_at timestamptz DEFAULT NULL,
  p_tab_id text DEFAULT NULL,
  p_generation_id text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_reason text;
  v_ended_at timestamptz;
  v_tab_closed boolean := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_session_key IS NULL OR length(p_session_key) < 8 THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_session_key, 0)
  );
  v_ended_at := clock_timestamp();

  v_reason := CASE
    WHEN p_reason IN ('sign_out', 'last_tab_closed', 'stale', 'timeout') THEN p_reason
    ELSE 'last_tab_closed'
  END;

  IF v_reason = 'sign_out' THEN
    -- Sign out: close ALL open sessions and tabs for this user across all keys
    UPDATE public.user_session_tabs
    SET logout_at = v_ended_at
    WHERE user_id = v_user_id
      AND logout_at IS NULL;

    UPDATE public.user_sessions
    SET logout_at = v_ended_at,
        last_seen_at = v_ended_at,
        ended_reason = 'sign_out'
    WHERE user_id = v_user_id
      AND logout_at IS NULL;

    RETURN true;
  END IF;

  -- Single tab close
  IF p_tab_id IS NULL OR length(p_tab_id) < 8
     OR p_generation_id IS NULL OR length(p_generation_id) < 8 THEN
    RETURN false;
  END IF;

  UPDATE public.user_session_tabs
  SET logout_at = v_ended_at
  WHERE user_id = v_user_id
    AND session_key = p_session_key
    AND tab_id = p_tab_id
    AND generation_id = p_generation_id
    AND logout_at IS NULL
    AND (p_started_at IS NULL OR started_at <= p_started_at);

  v_tab_closed := FOUND;

  IF NOT v_tab_closed THEN
    INSERT INTO public.user_session_tabs (
      user_id, session_key, tab_id, generation_id, started_at, logout_at
    )
    VALUES (
      v_user_id, p_session_key, p_tab_id, p_generation_id,
      COALESCE(p_started_at, v_ended_at), v_ended_at
    )
    ON CONFLICT (user_id, session_key, tab_id, generation_id) DO NOTHING;
  END IF;

  -- Check if ANY other active tabs remain for this session (excluding stale ones older than 3 minutes)
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_session_tabs t
    WHERE t.user_id = v_user_id
      AND t.session_key = p_session_key
      AND t.logout_at IS NULL
      AND t.started_at > v_ended_at - interval '3 minutes'
  ) THEN
    UPDATE public.user_sessions
    SET logout_at = v_ended_at,
        last_seen_at = v_ended_at,
        ended_reason = v_reason
    WHERE user_id = v_user_id
      AND session_key = p_session_key
      AND logout_at IS NULL;
  END IF;

  RETURN true;
END;
$$;

/*
 * Returns session history. Reconciles stale sessions first so that old / inactive
 * entries always display with their exact logout time instead of incorrectly showing active.
 */
CREATE OR REPLACE FUNCTION public.get_presence_sessions(
  p_days integer DEFAULT 30,
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  user_role text,
  login_at timestamptz,
  logout_at timestamptz,
  last_seen_at timestamptz,
  ended_reason text,
  user_agent text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_days integer := GREATEST(1, LEAST(COALESCE(p_days, 30), 90));
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 200), 500));
  v_since timestamptz := now() - (v_days || ' days')::interval;
BEGIN
  IF NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Always reconcile stale sessions before reading history!
  PERFORM public.reconcile_stale_presence_sessions(interval '3 minutes');

  -- Prune old sessions outside the retention window
  DELETE FROM public.user_sessions s
  WHERE s.login_at < v_since;

  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    u.name,
    u.email,
    u.role::text,
    s.login_at,
    s.logout_at,
    s.last_seen_at,
    s.ended_reason,
    s.user_agent
  FROM public.user_sessions s
  JOIN public.users u ON u.id = s.user_id
  WHERE s.login_at >= v_since
  ORDER BY s.login_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_stale_presence_sessions(interval) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ping_presence_session(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_presence_session(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.end_presence_session(text, text, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_presence_sessions(integer, integer) TO authenticated;

-- Immediate backfill/reconciliation of any existing orphaned sessions:
UPDATE public.user_sessions
SET logout_at = last_seen_at,
    ended_reason = 'stale'
WHERE logout_at IS NULL
  AND last_seen_at < (clock_timestamp() - interval '3 minutes');

UPDATE public.user_session_tabs
SET logout_at = clock_timestamp()
WHERE logout_at IS NULL
  AND started_at < (clock_timestamp() - interval '3 minutes');

-- Ensure RBAC page key exists and permissions are granted
CREATE OR REPLACE FUNCTION public.rbac_all_page_keys()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT ARRAY[
    'page.dashboard',
    'page.products', 'page.categories', 'page.brands', 'page.item-units',
    'page.inventory', 'page.erp.store-inventory', 'page.erp.stock-adjustments',
    'page.erp.item-transactions', 'page.erp.store-transfers', 'page.erp.transfer-requests',
    'page.erp.transfer-approvals', 'page.erp.transfer-statement', 'page.erp.transfer-bulk-payments',
    'page.erp.stores',
    'page.customers', 'page.orders', 'page.erp.fulfillment-queue', 'page.billing',
    'page.erp.estimates', 'page.erp.sales-orders', 'page.erp.invoices', 'page.erp.credit-notes',
    'page.erp.payments', 'page.erp.customer-bulk-payments', 'page.erp.recurring-invoices',
    'page.vendors', 'page.purchase-orders', 'page.erp.purchase-bills', 'page.erp.vendor-credits',
    'page.erp.expenses', 'page.erp.recurring-bills', 'page.erp.landed-costs',
    'page.erp.supplier-payments', 'page.erp.supplier-bulk-payments',
    'page.erp.banking', 'page.erp.payment-statement', 'page.erp.profit-withdrawals',
    'page.erp.account-types', 'page.erp.accounts', 'page.erp.journal-entries',
    'page.erp.reports', 'page.erp.financial-summary', 'page.erp.reconciliation', 'page.finance',
    'page.erp.vat-returns', 'page.erp.vat-payments',
    'page.erp.employees', 'page.erp.pay-slips', 'page.erp.salary-payments',
    'page.erp.salary-bulk-payments', 'page.erp.employee-opening-balances',
    'page.erp.fixed-assets',
    'page.business', 'page.config.tax', 'page.config.push',
    'page.users', 'page.users.online', 'page.config', 'page.roles'
  ];
$$;

INSERT INTO public.rbac_role_permissions (
  role_id,
  permission_key,
  store_id,
  can_read,
  can_write
)
SELECT p.role_id, 'page.users.online', NULL, p.can_read, p.can_write
FROM public.rbac_role_permissions p
WHERE p.permission_key = 'page.users'
  AND p.store_id IS NULL
ON CONFLICT (role_id, permission_key) WHERE store_id IS NULL DO NOTHING;

INSERT INTO public.rbac_role_permissions (
  role_id,
  permission_key,
  store_id,
  can_read,
  can_write
)
SELECT r.id, 'page.users.online', NULL, true, true
FROM public.rbac_roles r
WHERE r.slug = 'super_admin'
ON CONFLICT (role_id, permission_key) WHERE store_id IS NULL DO NOTHING;

NOTIFY pgrst, 'reload schema';

COMMIT;
