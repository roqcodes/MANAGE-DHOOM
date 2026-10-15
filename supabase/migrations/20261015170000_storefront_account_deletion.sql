-- Storefront (DHOOM Trading app) self-service account deletion for App Store / Play policy.

BEGIN;

CREATE OR REPLACE FUNCTION public.storefront_count_active_orders(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.orders o
  WHERE o.user_id = p_user_id
    AND o.status NOT IN ('delivered', 'cancelled');
$$;

CREATE OR REPLACE FUNCTION public.storefront_account_deletion_preview(p_user_id uuid DEFAULT auth.uid())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_active_orders integer;
  v_wallet_balance numeric;
  v_open_returns integer;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'not_authenticated',
      'message', 'Sign in to check account deletion eligibility.'
    );
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT u.role::text INTO v_role FROM public.users u WHERE u.id = p_user_id;

  IF v_role IS NOT NULL AND public.is_portal_staff_role(v_role) THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'staff_account',
      'message', 'This account is for DHOOM Manage staff access. Contact your administrator to remove portal access.'
    );
  END IF;

  v_active_orders := public.storefront_count_active_orders(p_user_id);
  IF v_active_orders > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'active_orders',
      'active_orders', v_active_orders,
      'message',
      'Finish or cancel open orders before deleting your account. Orders that are placed, processing, or in transit must be completed or cancelled first (same approach as Google Play account deletion guidance).'
    );
  END IF;

  SELECT count(*)::integer
  INTO v_open_returns
  FROM public.returns r
  WHERE r.user_id = p_user_id
    AND r.status IN ('pending', 'approved');

  IF v_open_returns > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'open_returns',
      'open_returns', v_open_returns,
      'message', 'You have a return or refund in progress. Wait until it is completed or contact support.'
    );
  END IF;

  SELECT w.balance
  INTO v_wallet_balance
  FROM public.wallet w
  WHERE w.user_id = p_user_id;

  IF COALESCE(v_wallet_balance, 0) > 0 THEN
    RETURN jsonb_build_object(
      'can_delete', false,
      'reason', 'wallet_balance',
      'wallet_balance', v_wallet_balance,
      'message', 'Withdraw or use your wallet balance before deleting your account, or contact support for help.'
    );
  END IF;

  RETURN jsonb_build_object(
    'can_delete', true,
    'reason', null,
    'message', 'You can permanently delete your DHOOM Trading account and associated app profile data.'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.storefront_delete_own_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_preview jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_preview := public.storefront_account_deletion_preview(v_uid);
  IF COALESCE(v_preview ->> 'can_delete', 'false') <> 'true' THEN
    RAISE EXCEPTION '%', COALESCE(v_preview ->> 'message', 'Account cannot be deleted right now.');
  END IF;

  UPDATE public.orders o
  SET
    user_id = NULL,
    phone = NULL,
    customer_name = NULL,
    company = NULL,
    gst_number = NULL,
    address_id = NULL
  WHERE o.user_id = v_uid
    AND o.status IN ('delivered', 'cancelled');

  UPDATE public.invoices i
  SET user_id = NULL
  WHERE i.user_id = v_uid;

  IF to_regclass('public.transactions') IS NOT NULL THEN
    UPDATE public.transactions t
    SET user_id = NULL
    WHERE t.user_id = v_uid;
  END IF;

  IF to_regclass('public.customer_credit_limits') IS NOT NULL THEN
    DELETE FROM public.customer_credit_limits ccl WHERE ccl.user_id = v_uid;
  END IF;

  PERFORM public.portal_user_delete_storefront_debris(v_uid);

  DELETE FROM public.users u WHERE u.id = v_uid;
END;
$$;

GRANT EXECUTE ON FUNCTION public.storefront_account_deletion_preview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.storefront_delete_own_account() TO authenticated;

COMMIT;
