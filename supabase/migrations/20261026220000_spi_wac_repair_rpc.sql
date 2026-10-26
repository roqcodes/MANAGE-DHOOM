-- Auditable SPI WAC repair from stock_movements (dry-run default; no journal changes).

BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_spi_wac_repair_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products (id) ON DELETE RESTRICT,
  dry_run boolean NOT NULL DEFAULT true,
  applied boolean NOT NULL DEFAULT false,
  qty_before numeric,
  qty_replay numeric,
  wac_before numeric,
  wac_after numeric,
  ambiguous jsonb NOT NULL DEFAULT '[]'::jsonb,
  actor_id uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key, product_id)
);

CREATE INDEX IF NOT EXISTS erp_spi_wac_repair_runs_store_idx
  ON public.erp_spi_wac_repair_runs (store_id, created_at DESC);

ALTER TABLE public.erp_spi_wac_repair_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_spi_wac_repair_runs_staff ON public.erp_spi_wac_repair_runs;
CREATE POLICY erp_spi_wac_repair_runs_staff
  ON public.erp_spi_wac_repair_runs
  FOR SELECT
  TO authenticated
  USING (public.is_staff_user());

CREATE OR REPLACE FUNCTION public.erp_resolve_stock_movement_unit_cost(
  p_product_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_transaction_price numeric
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit numeric;
BEGIN
  IF p_reference_type = 'purchase_bill' AND p_reference_id IS NOT NULL THEN
    SELECT COALESCE(pbl.unit_loaded_cost, pbl.purchase_price)
    INTO v_unit
    FROM public.erp_purchase_bill_lines pbl
    LEFT JOIN public.product_variants pv ON pv.id = pbl.variant_id
    WHERE pbl.purchase_bill_id = p_reference_id
      AND COALESCE(pbl.product_id, pv.product_id) = p_product_id
      AND pbl.quantity > 0
    ORDER BY pbl.id
    LIMIT 1;
    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;
  END IF;

  IF p_reference_type = 'purchase_receive' AND p_reference_id IS NOT NULL THEN
    SELECT public.resolve_receive_line_loaded_unit_cost(prl.bill_line_id, prl.purchase_price)
    INTO v_unit
    FROM public.erp_purchase_receive_lines prl
    LEFT JOIN public.product_variants pv ON pv.id = prl.variant_id
    WHERE prl.purchase_receive_id = p_reference_id
      AND COALESCE(prl.product_id, pv.product_id) = p_product_id
      AND COALESCE(prl.accepted_qty, 0) > 0
    ORDER BY prl.id
    LIMIT 1;
    IF v_unit IS NOT NULL AND v_unit > 0 THEN
      RETURN v_unit;
    END IF;
  END IF;

  IF COALESCE(p_transaction_price, 0) > 0 THEN
    RETURN p_transaction_price;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_replay_product_wac_from_movements(
  p_store_id uuid,
  p_product_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_qty numeric := 0;
  v_wac numeric := 0;
  v_unit numeric;
  v_delta numeric;
  v_ambiguous jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT
      sm.quantity,
      sm.type,
      sm.reference_type,
      sm.reference_id,
      sm.transaction_price,
      sm.created_at
    FROM public.stock_movements sm
    WHERE sm.store_id = p_store_id
      AND sm.product_id = p_product_id
    ORDER BY sm.created_at ASC, sm.id ASC
  LOOP
    v_delta := COALESCE(r.quantity, 0);
    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    IF v_delta > 0 THEN
      v_unit := public.erp_resolve_stock_movement_unit_cost(
        p_product_id, r.reference_type, r.reference_id, r.transaction_price
      );
      IF v_unit IS NULL OR v_unit < 0 THEN
        v_ambiguous := v_ambiguous || jsonb_build_array(
          jsonb_build_object(
            'at', r.created_at,
            'type', r.type,
            'issue', 'missing_unit_cost_on_receipt',
            'quantity', v_delta
          )
        );
        CONTINUE;
      END IF;

      IF v_qty <= 0 THEN
        v_qty := v_delta;
        v_wac := v_unit;
      ELSE
        v_wac := (v_qty * v_wac + v_delta * v_unit) / (v_qty + v_delta);
        v_qty := v_qty + v_delta;
      END IF;
      v_wac := ROUND(v_wac, 4);
      CONTINUE;
    END IF;

    IF v_qty < abs(v_delta) THEN
      v_ambiguous := v_ambiguous || jsonb_build_array(
        jsonb_build_object(
          'at', r.created_at,
          'type', r.type,
          'issue', 'insufficient_replay_qty',
          'qty_before', v_qty,
          'out_qty', abs(v_delta)
        )
      );
      v_qty := GREATEST(0, v_qty - abs(v_delta));
      IF v_qty = 0 THEN
        v_wac := 0;
      END IF;
      CONTINUE;
    END IF;

    v_qty := v_qty - abs(v_delta);
    IF v_qty = 0 THEN
      v_wac := 0;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'qty', ROUND(v_qty, 3),
    'wac', ROUND(v_wac, 4),
    'value', ROUND(v_qty * v_wac, 2),
    'ambiguous', v_ambiguous
  );
END;
$$;

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
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_store_id IS NULL THEN
    RAISE EXCEPTION 'Store is required';
  END IF;
  PERFORM public.require_store_access(p_store_id, p_actor);

  IF NOT p_dry_run THEN
    IF NOT COALESCE(p_confirm, false) THEN
      RAISE EXCEPTION 'Set p_confirm = true to apply SPI WAC repair';
    END IF;
    IF NULLIF(BTRIM(p_idempotency_key), '') IS NULL THEN
      RAISE EXCEPTION 'p_idempotency_key is required for apply';
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
      v_spi_qty, v_qty_r, v_spi_wac, v_wac_r, v_amb, p_actor
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

DROP FUNCTION IF EXISTS public.erp_reapply_bill_loaded_wac(uuid, uuid);

GRANT EXECUTE ON FUNCTION public.erp_resolve_stock_movement_unit_cost(uuid, text, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_replay_product_wac_from_movements(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_spi_wac_repair(uuid, uuid[], boolean, boolean, text, uuid) TO authenticated;

COMMIT;
