-- Phase 4: Generic ERP client operation idempotency ledger (separate from POS).

BEGIN;

CREATE TABLE IF NOT EXISTS public.erp_client_operations (
  operation_id uuid PRIMARY KEY,
  operation_type text NOT NULL,
  payload_hash text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores (id) ON DELETE RESTRICT,
  terminal_id text,
  status text NOT NULL CHECK (status IN ('PENDING', 'COMMITTED', 'FAILED')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS erp_client_operations_user_id_idx
  ON public.erp_client_operations (user_id);

CREATE INDEX IF NOT EXISTS erp_client_operations_store_id_idx
  ON public.erp_client_operations (store_id);

CREATE INDEX IF NOT EXISTS erp_client_operations_status_idx
  ON public.erp_client_operations (status);

CREATE INDEX IF NOT EXISTS erp_client_operations_created_at_idx
  ON public.erp_client_operations (created_at DESC);

ALTER TABLE public.erp_client_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.erp_client_operations FROM PUBLIC;
REVOKE ALL ON TABLE public.erp_client_operations FROM authenticated;

-- Certification-only execution counter (operation_type test.certify).
CREATE SEQUENCE IF NOT EXISTS public.erp_certify_execution_seq;

CREATE OR REPLACE FUNCTION public.erp_canonical_jsonb(p_value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
AS $$
DECLARE
  v_type text;
  v_result jsonb;
  v_key text;
BEGIN
  IF p_value IS NULL THEN
    RETURN 'null'::jsonb;
  END IF;

  v_type := jsonb_typeof(p_value);

  IF v_type = 'object' THEN
    v_result := '{}'::jsonb;
    FOR v_key IN
      SELECT key FROM jsonb_object_keys(p_value) AS key ORDER BY key
    LOOP
      v_result := v_result || jsonb_build_object(
        v_key,
        public.erp_canonical_jsonb(p_value -> v_key)
      );
    END LOOP;
    RETURN v_result;
  END IF;

  IF v_type = 'array' THEN
    SELECT COALESCE(
      jsonb_agg(public.erp_canonical_jsonb(value) ORDER BY ord),
      '[]'::jsonb
    )
    INTO v_result
    FROM jsonb_array_elements(p_value) WITH ORDINALITY AS t(value, ord);
    RETURN v_result;
  END IF;

  RETURN p_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_payload_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT encode(
    extensions.digest(public.erp_canonical_jsonb(p_payload)::text, 'sha256'),
    'hex'
  );
$$;

CREATE OR REPLACE FUNCTION public.run_erp_client_idempotent_operation(
  p_operation_id uuid,
  p_operation_type text,
  p_payload_hash text,
  p_payload jsonb,
  p_store_id uuid,
  p_terminal_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.erp_client_operations%ROWTYPE;
  v_computed_hash text;
  v_result jsonb;
  v_exec_nonce bigint;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_UNAUTHORIZED'
      USING ERRCODE = '28000';
  END IF;

  IF p_operation_id IS NULL OR p_operation_type IS NULL OR p_payload_hash IS NULL OR p_payload IS NULL OR p_store_id IS NULL THEN
    RAISE EXCEPTION 'ERP_CLIENT_INVALID_REQUEST'
      USING ERRCODE = '22023';
  END IF;

  PERFORM public.require_store_access(p_store_id, v_uid);

  v_computed_hash := public.erp_payload_hash(p_payload);
  IF v_computed_hash <> p_payload_hash THEN
    RAISE EXCEPTION 'ERP_CLIENT_PAYLOAD_HASH_MISMATCH'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.erp_client_operations (
    operation_id,
    operation_type,
    payload_hash,
    user_id,
    store_id,
    terminal_id,
    status
  )
  VALUES (
    p_operation_id,
    p_operation_type,
    p_payload_hash,
    v_uid,
    p_store_id,
    p_terminal_id,
    'PENDING'
  )
  ON CONFLICT (operation_id) DO NOTHING;

  SELECT *
  INTO v_row
  FROM public.erp_client_operations
  WHERE operation_id = p_operation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ERP_CLIENT_OPERATION_NOT_FOUND'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_row.user_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'ERP_CLIENT_USER_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.store_id IS DISTINCT FROM p_store_id THEN
    RAISE EXCEPTION 'ERP_CLIENT_STORE_MISMATCH'
      USING ERRCODE = '42501';
  END IF;

  IF v_row.operation_type IS DISTINCT FROM p_operation_type THEN
    RAISE EXCEPTION 'ERP_CLIENT_OPERATION_TYPE_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF v_row.payload_hash IS DISTINCT FROM p_payload_hash THEN
    RAISE EXCEPTION 'ERP_CLIENT_PAYLOAD_HASH_CONFLICT'
      USING ERRCODE = '23505';
  END IF;

  IF v_row.status = 'COMMITTED' THEN
    RETURN jsonb_build_object(
      'idempotentReplay', true,
      'result', v_row.result
    );
  END IF;

  -- Certification-only handler (Phase 4). ERP families wire here in later phases.
  IF p_operation_type = 'test.certify' THEN
    IF COALESCE((p_payload ->> 'fail')::boolean, false) THEN
      RAISE EXCEPTION 'ERP_CLIENT_CERTIFY_FAILURE'
        USING ERRCODE = 'P0001';
    END IF;
    v_exec_nonce := nextval('public.erp_certify_execution_seq');
    v_result := jsonb_build_object(
      'certified', true,
      'executionNonce', v_exec_nonce
    );
  ELSE
    RAISE EXCEPTION 'ERP_CLIENT_UNSUPPORTED_OPERATION_TYPE'
      USING ERRCODE = '0A000';
  END IF;

  UPDATE public.erp_client_operations
  SET
    status = 'COMMITTED',
    result = v_result,
    updated_at = now()
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'idempotentReplay', false,
    'result', v_result
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_payload_hash(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_erp_client_idempotent_operation(
  uuid, text, text, jsonb, uuid, text
) TO authenticated;

COMMIT;
