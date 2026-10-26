-- SPI WAC repair: allow service_role (scripts) and staff sessions; SQL editor needs p_actor or staff JWT.

BEGIN;

CREATE OR REPLACE FUNCTION public.erp_spi_wac_repair(
  p_store_id uuid,
  p_product_ids uuid[] DEFAULT NULL,
  p_dry_run boolean DEFAULT true,
  p_confirm boolean DEFAULT false,
  p_idempotency_key text DEFAULT NULL,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_spi_qty numeric;
  v_spi_wac numeric;
  v_replay jsonb;
  v_qty_r numeric;
  v_wac_r numeric;
  v_amb jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_applied_count integer := 0;
  v_skipped_count integer := 0;
  v_key text;
  v_actor uuid;
  v_is_service boolean := COALESCE(auth.jwt() ->> 'role', '') = 'service_role';
BEGIN
  PERFORM public.erp_require_staff_or_service_role();

  v_actor := COALESCE(p_actor, auth.uid());

  IF v_is_service AND v_actor IS NULL THEN
    IF NOT p_dry_run THEN
      RAISE EXCEPTION 'p_actor (staff user id) is required when applying repair via service_role';
    END IF;
  ELSIF v_actor IS NULL OR NOT public.is_staff_user(v_actor) THEN
    RAISE EXCEPTION
      'Forbidden: sign in as staff, pass p_actor, use service_role JWT, or npm run erp:inventory:wac-repair:dry-run';
  END IF;

  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;

  IF NOT v_is_service THEN
    PERFORM public.require_store_access(p_store_id, v_actor);
  END IF;

  IF NOT p_dry_run THEN
    IF NOT COALESCE(p_confirm, false) THEN
      RAISE EXCEPTION 'Set p_confirm = true to apply SPI WAC repair';
    END IF;
    IF NULLIF(BTRIM(p_idempotency_key), '') IS NULL THEN
      RAISE EXCEPTION 'p_idempotency_key is required for apply';
    END IF;
    IF v_actor IS NULL THEN
      RAISE EXCEPTION 'p_actor is required for apply';
    END IF;
  END IF;

  v_key := NULLIF(BTRIM(p_idempotency_key), '');

  FOR v_pid IN
    SELECT DISTINCT x.product_id
    FROM (
      SELECT unnest(p_product_ids) AS product_id
      WHERE p_product_ids IS NOT NULL AND cardinality(p_product_ids) > 0
      UNION ALL
      SELECT spi.product_id
      FROM public.store_product_inventory spi
      WHERE p_product_ids IS NULL
        AND spi.store_id = p_store_id
        AND COALESCE(spi.stock, 0) <> 0
    ) x
    WHERE x.product_id IS NOT NULL
  LOOP
    IF NOT p_dry_run AND v_key IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.erp_spi_wac_repair_runs r
        WHERE r.idempotency_key = v_key
          AND r.product_id = v_pid
          AND r.applied = true
      ) THEN
        v_skipped_count := v_skipped_count + 1;
        v_lines := v_lines || jsonb_build_array(
          jsonb_build_object(
            'product_id', v_pid,
            'skipped', true,
            'reason', 'idempotency_key_already_applied',
            'idempotency_key', v_key
          )
        );
        CONTINUE;
      END IF;
    END IF;

    SELECT stock, purchase_price
    INTO v_spi_qty, v_spi_wac
    FROM public.store_product_inventory
    WHERE store_id = p_store_id AND product_id = v_pid;

    v_replay := public.erp_replay_product_wac_from_movements(p_store_id, v_pid);
    v_qty_r := (v_replay ->> 'qty')::numeric;
    v_wac_r := (v_replay ->> 'wac')::numeric;
    v_amb := COALESCE(v_replay -> 'ambiguous', '[]'::jsonb);

    IF jsonb_array_length(v_amb) > 0 THEN
      v_skipped_count := v_skipped_count + 1;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pid,
          'skipped', true,
          'reason', 'ambiguous_movements',
          'ambiguous', v_amb,
          'current_qty', v_spi_qty,
          'current_wac', v_spi_wac,
          'reconstructed_qty', v_qty_r,
          'reconstructed_wac', v_wac_r
        )
      );
      CONTINUE;
    END IF;

    IF abs(COALESCE(v_spi_qty, 0) - COALESCE(v_qty_r, 0)) > 0.001 THEN
      v_skipped_count := v_skipped_count + 1;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pid,
          'skipped', true,
          'reason', 'qty_mismatch_spi_vs_movements',
          'current_qty', v_spi_qty,
          'reconstructed_qty', v_qty_r,
          'current_wac', v_spi_wac,
          'reconstructed_wac', v_wac_r
        )
      );
      CONTINUE;
    END IF;

    IF abs(COALESCE(v_spi_wac, 0) - COALESCE(v_wac_r, 0)) < 0.0001 THEN
      v_skipped_count := v_skipped_count + 1;
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pid,
          'skipped', true,
          'reason', 'already_at_target_wac',
          'wac', v_spi_wac
        )
      );
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_lines := v_lines || jsonb_build_array(
        jsonb_build_object(
          'product_id', v_pid,
          'dry_run', true,
          'would_apply', true,
          'current_qty', v_spi_qty,
          'current_wac', v_spi_wac,
          'current_value', ROUND(COALESCE(v_spi_qty, 0) * COALESCE(v_spi_wac, 0), 2),
          'reconstructed_wac', v_wac_r,
          'reconstructed_value', (v_replay ->> 'value')::numeric
        )
      );
      CONTINUE;
    END IF;

    UPDATE public.store_product_inventory
    SET purchase_price = v_wac_r, updated_at = now()
    WHERE store_id = p_store_id
      AND product_id = v_pid
      AND COALESCE(stock, 0) > 0;

    INSERT INTO public.erp_spi_wac_repair_runs (
      idempotency_key, store_id, product_id, dry_run, applied,
      qty_before, qty_replay, wac_before, wac_after, ambiguous, actor_id
    )
    VALUES (
      v_key, p_store_id, v_pid, false, true,
      v_spi_qty, v_qty_r, v_spi_wac, v_wac_r, v_amb, v_actor
    );

    v_applied_count := v_applied_count + 1;
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'product_id', v_pid,
        'applied', true,
        'wac_before', v_spi_wac,
        'wac_after', v_wac_r
      )
    );
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'store_id', p_store_id,
    'idempotency_key', v_key,
    'applied_count', v_applied_count,
    'skipped_count', v_skipped_count,
    'lines', v_lines,
    'note',
      'SPI/WAC only — posted journals and historical invoice COGS are unchanged'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_spi_wac_repair(uuid, uuid[], boolean, boolean, text, uuid) TO service_role;

COMMIT;
