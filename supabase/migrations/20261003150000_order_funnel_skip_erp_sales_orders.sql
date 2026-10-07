-- ERP sales orders (and manual admin orders) are not ecommerce checkout funnel events.
-- orders.user_id references public.users; order_funnel_reach.user_id references auth.users.

BEGIN;

CREATE OR REPLACE FUNCTION public.trg_order_funnel_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funnel_user_id uuid;
BEGIN
  IF COALESCE(NEW.source, '') IN ('sales_order', 'manual') THEN
    RETURN NEW;
  END IF;

  v_funnel_user_id := NULL;
  IF NEW.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.users au WHERE au.id = NEW.user_id
  ) THEN
    v_funnel_user_id := NEW.user_id;
  END IF;

  INSERT INTO public.order_funnel_reach (
    order_id,
    user_id,
    total_amount,
    checkout_at,
    completed_at
  )
  VALUES (
    NEW.id,
    v_funnel_user_id,
    COALESCE(NEW.total_amount, 0),
    COALESCE(NEW.created_at, now()),
    CASE
      WHEN NEW.status IN ('processing', 'shipped', 'delivered')
        THEN COALESCE(NEW.created_at, now())
      ELSE NULL
    END
  )
  ON CONFLICT (order_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_order_funnel_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_funnel_user_id uuid;
BEGIN
  IF COALESCE(NEW.source, '') IN ('sales_order', 'manual') THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('processing', 'shipped', 'delivered')
     AND COALESCE(OLD.status, '') NOT IN ('processing', 'shipped', 'delivered')
  THEN
    v_funnel_user_id := NULL;
    IF NEW.user_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM auth.users au WHERE au.id = NEW.user_id
    ) THEN
      v_funnel_user_id := NEW.user_id;
    END IF;

    INSERT INTO public.order_funnel_reach (
      order_id, user_id, total_amount, checkout_at, completed_at
    )
    VALUES (
      NEW.id,
      v_funnel_user_id,
      COALESCE(NEW.total_amount, 0),
      COALESCE(NEW.created_at, now()),
      now()
    )
    ON CONFLICT (order_id) DO UPDATE
      SET completed_at = COALESCE(public.order_funnel_reach.completed_at, EXCLUDED.completed_at),
          total_amount = EXCLUDED.total_amount;
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
