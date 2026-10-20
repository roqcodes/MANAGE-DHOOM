-- Historical COGS / inventory GL correction for eligible posted sales (dry-run + apply).
-- Idempotent: safe to rerun; does not void or rewrite existing revenue journals.

BEGIN;

-- ─── Posted COGS helpers (invoice + deferred + historical backfill) ─────────

CREATE OR REPLACE FUNCTION public.erp_invoice_posted_cogs_gl_total(p_invoice_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cogs_account uuid;
BEGIN
  v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');
  IF v_cogs_account IS NULL THEN
    RETURN 0;
  END IF;

  RETURN ROUND(COALESCE((
    SELECT SUM(COALESCE(jel.debit_amount, 0) - COALESCE(jel.credit_amount, 0))
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE jel.account_id = v_cogs_account
      AND je.status = 'posted'
      AND (
        (je.source_entity_type = 'invoice' AND je.source_entity_id = p_invoice_id)
        OR (
          je.source_entity_type = 'invoice_deferred_cogs'
          AND je.source_entity_id IN (
            SELECT d.id FROM public.erp_invoice_deferred_cogs_postings d WHERE d.invoice_id = p_invoice_id
          )
        )
        OR (je.source_entity_type = 'invoice_cogs_backfill' AND je.source_entity_id = p_invoice_id)
      )
  ), 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_credit_note_posted_cogs_gl_total(p_credit_note_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cogs_account uuid;
BEGIN
  v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');
  IF v_cogs_account IS NULL THEN
    RETURN 0;
  END IF;

  -- Credit notes reverse COGS with credits to the COGS account.
  RETURN ROUND(COALESCE((
    SELECT SUM(COALESCE(jel.credit_amount, 0) - COALESCE(jel.debit_amount, 0))
    FROM public.journal_entries je
    JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
    WHERE jel.account_id = v_cogs_account
      AND je.status = 'posted'
      AND (
        (je.source_entity_type = 'credit_note' AND je.source_entity_id = p_credit_note_id)
        OR (je.source_entity_type = 'credit_note_cogs_backfill' AND je.source_entity_id = p_credit_note_id)
      )
  ), 0), 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_invoice_has_posted_revenue_journal(p_invoice_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.journal_entries je
    WHERE je.source_entity_type = 'invoice'
      AND je.source_entity_id = p_invoice_id
      AND je.status = 'posted'
  );
$$;

-- ─── Void invoice journals: include COGS backfill ───────────────────────────

CREATE OR REPLACE FUNCTION public.void_journals_for_entity(p_source_type text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_source_type IS NULL OR p_source_id IS NULL THEN
    RETURN;
  END IF;

  IF p_source_type = 'invoice' THEN
    FOR v_id IN
      SELECT d.journal_entry_id
      FROM public.erp_invoice_deferred_cogs_postings d
      WHERE d.invoice_id = p_source_id
        AND d.journal_entry_id IS NOT NULL
    LOOP
      PERFORM public.void_posted_journal(v_id);
    END LOOP;

    FOR v_id IN
      SELECT id FROM public.journal_entries
      WHERE source_entity_type = 'invoice_cogs_backfill'
        AND source_entity_id = p_source_id
        AND status = 'posted'
    LOOP
      PERFORM public.void_posted_journal(v_id);
    END LOOP;
  END IF;

  IF p_source_type = 'credit_note' THEN
    FOR v_id IN
      SELECT id FROM public.journal_entries
      WHERE source_entity_type = 'credit_note_cogs_backfill'
        AND source_entity_id = p_source_id
        AND status = 'posted'
    LOOP
      PERFORM public.void_posted_journal(v_id);
    END LOOP;
  END IF;

  FOR v_id IN
    SELECT id FROM public.journal_entries
    WHERE source_entity_type = p_source_type
      AND source_entity_id = p_source_id
      AND status = 'posted'
  LOOP
    PERFORM public.void_posted_journal(v_id);
  END LOOP;
END;
$$;

-- ─── Replace audit (detect only) + summary counts ───────────────────────────

CREATE OR REPLACE FUNCTION public.erp_audit_missing_sale_cogs_gl(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_date_from, '1970-01-01'::date);
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(row_to_json(x))
      FROM (
        SELECT
          i.id AS invoice_id,
          i.invoice_number,
          i.store_id,
          COALESCE(i.issued_at::date, i.created_at::date) AS invoice_date,
          public.erp_invoice_recognized_cogs_total(i.id) AS expected_cogs,
          public.erp_invoice_posted_cogs_gl_total(i.id) AS posted_cogs,
          ROUND(
            public.erp_invoice_recognized_cogs_total(i.id)
            - public.erp_invoice_posted_cogs_gl_total(i.id),
            2
          ) AS cogs_gap,
          public.erp_invoice_has_posted_revenue_journal(i.id) AS has_revenue_journal
        FROM public.invoices i
        WHERE i.status IN ('issued', 'partial', 'paid')
          AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
          AND (p_store_id IS NULL OR i.store_id = p_store_id)
        ORDER BY cogs_gap DESC
        LIMIT p_limit
      ) x
      WHERE x.cogs_gap > 0.01
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_audit_sale_cogs_gl_summary(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_date_from, '1970-01-01'::date);
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_scanned integer := 0;
  v_already_correct integer := 0;
  v_missing_backfill integer := 0;
  v_uncosted_only integer := 0;
  v_no_revenue_journal integer := 0;
  v_over_posted integer := 0;
  v_gap_total numeric := 0;
  v_expected_total numeric := 0;
  v_posted_total numeric := 0;
  r record;
  v_expected numeric;
  v_posted numeric;
  v_gap numeric;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_staff_user() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id);
  END IF;

  FOR r IN
    SELECT i.id
    FROM public.invoices i
    WHERE i.status IN ('issued', 'partial', 'paid')
      AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
  LOOP
    v_scanned := v_scanned + 1;
    v_expected := public.erp_invoice_recognized_cogs_total(r.id);
    v_posted := public.erp_invoice_posted_cogs_gl_total(r.id);
    v_gap := ROUND(v_expected - v_posted, 2);
    v_expected_total := v_expected_total + v_expected;
    v_posted_total := v_posted_total + v_posted;

    IF v_expected <= 0.01 AND v_posted <= 0.01 THEN
      v_uncosted_only := v_uncosted_only + 1;
    ELSIF v_gap <= 0.01 AND v_gap >= -0.01 THEN
      v_already_correct := v_already_correct + 1;
    ELSIF v_gap < -0.01 THEN
      v_over_posted := v_over_posted + 1;
    ELSIF NOT public.erp_invoice_has_posted_revenue_journal(r.id) THEN
      v_no_revenue_journal := v_no_revenue_journal + 1;
    ELSE
      v_missing_backfill := v_missing_backfill + 1;
      v_gap_total := v_gap_total + v_gap;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'date_from', v_from,
    'date_to', v_to,
    'store_id', p_store_id,
    'invoices_scanned', v_scanned,
    'already_correct', v_already_correct,
    'missing_cogs_backfill', v_missing_backfill,
    'uncosted_or_zero_cogs', v_uncosted_only,
    'missing_revenue_journal', v_no_revenue_journal,
    'over_posted_manual_review', v_over_posted,
    'total_expected_cogs', ROUND(v_expected_total, 2),
    'total_posted_cogs', ROUND(v_posted_total, 2),
    'total_cogs_gap_eligible', ROUND(v_gap_total, 2)
  );
END;
$$;

-- ─── Line-level classification for dry-run report ───────────────────────────

CREATE OR REPLACE FUNCTION public.erp_invoice_line_cogs_backfill_rows(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lines jsonb := '[]'::jsonb;
  r record;
  mc record;
  v_status text;
BEGIN
  FOR r IN
    SELECT
      ii.id AS invoice_item_id,
      ii.product_name,
      ii.quantity,
      ii.pending_cost_qty,
      ii.base_price,
      ii.unit_price,
      ii.variant_id,
      ii.product_id,
      COALESCE(ii.taxable_amount, ii.total_amount - ii.gst_amount) AS taxable_amount,
      i.store_id
    FROM public.invoice_items ii
    JOIN public.invoices i ON i.id = ii.invoice_id
    WHERE ii.invoice_id = p_invoice_id
  LOOP
    SELECT * INTO mc
    FROM public.erp_invoice_item_margin_components(
      r.base_price,
      r.unit_price,
      r.variant_id,
      r.product_id,
      r.store_id,
      r.quantity,
      r.pending_cost_qty,
      r.taxable_amount
    );

    IF COALESCE(r.pending_cost_qty, 0) >= COALESCE(r.quantity, 0) AND COALESCE(r.quantity, 0) > 0 THEN
      v_status := 'uncosted_pending';
    ELSIF COALESCE(mc.line_cogs, 0) <= 0.01 THEN
      v_status := 'no_recognized_cost';
    ELSE
      v_status := 'recognized_cost';
    END IF;

    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'invoice_item_id', r.invoice_item_id,
        'product_name', r.product_name,
        'quantity', r.quantity,
        'pending_cost_qty', r.pending_cost_qty,
        'line_cogs', mc.line_cogs,
        'uncosted_revenue', mc.uncosted_revenue,
        'status', v_status
      )
    );
  END LOOP;

  RETURN v_lines;
END;
$$;

-- ─── Apply: supplemental COGS journal (does not touch revenue journal) ───────

CREATE OR REPLACE FUNCTION public.erp_post_invoice_cogs_backfill(
  p_invoice_id uuid,
  p_actor uuid DEFAULT auth.uid(),
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected numeric;
  v_posted numeric;
  v_gap numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_existing uuid;
  v_existing_amt numeric;
  v_cogs_account uuid;
  v_lines jsonb;
  v_journal_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, invoice_number, COALESCE(issued_at::date, created_at::date)
  INTO v_store_id, v_number, v_date
  FROM public.invoices
  WHERE id = p_invoice_id
    AND status IN ('issued', 'partial', 'paid');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'action', 'skipped', 'reason', 'ineligible_status');
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  IF NOT public.erp_invoice_has_posted_revenue_journal(p_invoice_id) THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'skipped',
      'reason', 'no_posted_revenue_journal'
    );
  END IF;

  v_expected := public.erp_invoice_recognized_cogs_total(p_invoice_id);
  v_posted := public.erp_invoice_posted_cogs_gl_total(p_invoice_id);
  v_gap := ROUND(v_expected - v_posted, 2);

  IF v_gap <= 0.01 THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'already_correct',
      'expected_cogs', v_expected,
      'posted_cogs', v_posted,
      'gap', v_gap
    );
  END IF;

  IF v_gap < -0.01 THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'manual_review',
      'reason', 'over_posted_cogs',
      'expected_cogs', v_expected,
      'posted_cogs', v_posted,
      'gap', v_gap
    );
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'invoice_cogs_backfill'
    AND source_entity_id = p_invoice_id
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');
    SELECT ROUND(COALESCE(SUM(jel.debit_amount), 0), 2) INTO v_existing_amt
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = v_existing
      AND jel.account_id = v_cogs_account;

    IF ABS(v_existing_amt - v_gap) > 0.02 THEN
      RETURN jsonb_build_object(
        'invoice_id', p_invoice_id,
        'action', 'manual_review',
        'reason', 'backfill_amount_mismatch',
        'expected_gap', v_gap,
        'existing_backfill_cogs', v_existing_amt,
        'journal_entry_id', v_existing
      );
    END IF;

    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'action', 'already_correct',
      'expected_cogs', v_expected,
      'posted_cogs', v_posted,
      'gap', v_gap,
      'journal_entry_id', v_existing
    );
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'invoice_id', p_invoice_id,
      'invoice_number', v_number,
      'store_id', v_store_id,
      'transaction_date', v_date,
      'action', 'would_post',
      'expected_cogs', v_expected,
      'posted_cogs', v_posted,
      'gap', v_gap,
      'proposed_lines', jsonb_build_array(
        jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'debit', v_gap),
        jsonb_build_object('account_code', 'STOCK', 'credit', v_gap)
      ),
      'lines', public.erp_invoice_line_cogs_backfill_rows(p_invoice_id)
    );
  END IF;

  IF NOT public.is_posting_enabled('invoice') THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'action', 'skipped', 'reason', 'posting_disabled');
  END IF;

  PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');

  v_lines := jsonb_build_array(
    jsonb_build_object(
      'account_code', 'COST_OF_GOODS_SOLD',
      'debit', v_gap,
      'description', 'Historical COGS backfill — ' || v_number
    ),
    jsonb_build_object(
      'account_code', 'STOCK',
      'credit', v_gap,
      'description', 'Inventory — historical COGS'
    )
  );

  v_journal_id := public.create_posted_journal_entry(
    v_date,
    'COGS backfill — invoice ' || v_number,
    v_store_id,
    'invoice_cogs_backfill',
    p_invoice_id,
    v_lines,
    p_actor
  );

  RETURN jsonb_build_object(
    'invoice_id', p_invoice_id,
    'action', 'posted',
    'journal_entry_id', v_journal_id,
    'amount', v_gap,
    'transaction_date', v_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.erp_post_credit_note_cogs_backfill(
  p_credit_note_id uuid,
  p_actor uuid DEFAULT auth.uid(),
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected numeric;
  v_posted numeric;
  v_gap numeric;
  v_store_id uuid;
  v_date date;
  v_number text;
  v_existing uuid;
  v_existing_amt numeric;
  v_cogs_account uuid;
  v_lines jsonb;
  v_journal_id uuid;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT store_id, credit_note_number, credit_note_date
  INTO v_store_id, v_number, v_date
  FROM public.erp_credit_notes
  WHERE id = p_credit_note_id
    AND status IN ('issued', 'applied');

  IF NOT FOUND THEN
    RETURN jsonb_build_object('credit_note_id', p_credit_note_id, 'action', 'skipped', 'reason', 'ineligible_status');
  END IF;

  PERFORM public.require_store_access(v_store_id, p_actor);

  v_expected := public.erp_credit_note_recognized_cogs_total(p_credit_note_id, v_store_id);
  v_posted := public.erp_credit_note_posted_cogs_gl_total(p_credit_note_id);
  v_gap := ROUND(v_expected - v_posted, 2);

  IF v_expected <= 0.01 THEN
    RETURN jsonb_build_object('credit_note_id', p_credit_note_id, 'action', 'skipped', 'reason', 'no_recognized_cost');
  END IF;

  IF v_gap <= 0.01 THEN
    RETURN jsonb_build_object(
      'credit_note_id', p_credit_note_id,
      'action', 'already_correct',
      'expected_cogs_reversal', v_expected,
      'posted_cogs_reversal', v_posted,
      'gap', v_gap
    );
  END IF;

  IF v_gap < -0.01 THEN
    RETURN jsonb_build_object(
      'credit_note_id', p_credit_note_id,
      'action', 'manual_review',
      'reason', 'over_posted_cogs_reversal',
      'gap', v_gap
    );
  END IF;

  SELECT id INTO v_existing
  FROM public.journal_entries
  WHERE source_entity_type = 'credit_note_cogs_backfill'
    AND source_entity_id = p_credit_note_id
    AND status = 'posted';

  IF v_existing IS NOT NULL THEN
    v_cogs_account := public.get_account_by_code('COST_OF_GOODS_SOLD');
    SELECT ROUND(COALESCE(SUM(jel.credit_amount), 0), 2) INTO v_existing_amt
    FROM public.journal_entry_lines jel
    WHERE jel.journal_entry_id = v_existing
      AND jel.account_id = v_cogs_account;

    IF ABS(v_existing_amt - v_gap) > 0.02 THEN
      RETURN jsonb_build_object(
        'credit_note_id', p_credit_note_id,
        'action', 'manual_review',
        'reason', 'backfill_amount_mismatch',
        'expected_gap', v_gap,
        'existing_backfill', v_existing_amt
      );
    END IF;

    RETURN jsonb_build_object('credit_note_id', p_credit_note_id, 'action', 'already_correct');
  END IF;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'credit_note_id', p_credit_note_id,
      'credit_note_number', v_number,
      'action', 'would_post',
      'gap', v_gap,
      'transaction_date', v_date,
      'proposed_lines', jsonb_build_array(
        jsonb_build_object('account_code', 'STOCK', 'debit', v_gap),
        jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'credit', v_gap)
      )
    );
  END IF;

  IF NOT public.is_posting_enabled('credit_note') THEN
    RETURN jsonb_build_object('credit_note_id', p_credit_note_id, 'action', 'skipped', 'reason', 'posting_disabled');
  END IF;

  PERFORM public.ensure_system_ledger_account('COST_OF_GOODS_SOLD', 'Cost of Goods Sold');
  PERFORM public.ensure_system_ledger_account('STOCK', 'Stock');

  v_lines := jsonb_build_array(
    jsonb_build_object('account_code', 'STOCK', 'debit', v_gap, 'description', 'CN inventory return backfill'),
    jsonb_build_object('account_code', 'COST_OF_GOODS_SOLD', 'credit', v_gap, 'description', 'CN COGS reversal backfill')
  );

  v_journal_id := public.create_posted_journal_entry(
    v_date,
    'COGS backfill — credit note ' || v_number,
    v_store_id,
    'credit_note_cogs_backfill',
    p_credit_note_id,
    v_lines,
    p_actor
  );

  RETURN jsonb_build_object(
    'credit_note_id', p_credit_note_id,
    'action', 'posted',
    'journal_entry_id', v_journal_id,
    'amount', v_gap
  );
END;
$$;

-- ─── Dry-run / apply batch ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.erp_backfill_sale_cogs_gl(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_store_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 500,
  p_dry_run boolean DEFAULT true,
  p_include_credit_notes boolean DEFAULT true,
  p_actor uuid DEFAULT auth.uid()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := COALESCE(p_date_from, '1970-01-01'::date);
  v_to date := COALESCE(p_date_to, CURRENT_DATE);
  v_summary jsonb;
  v_invoice_results jsonb := '[]'::jsonb;
  v_cn_results jsonb := '[]'::jsonb;
  v_posted_count integer := 0;
  v_would_post_count integer := 0;
  v_skipped_count integer := 0;
  v_review_count integer := 0;
  v_cogs_delta numeric := 0;
  r record;
  v_one jsonb;
BEGIN
  IF p_actor IS NULL OR NOT public.is_staff_user(p_actor) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF p_store_id IS NOT NULL THEN
    PERFORM public.require_store_access(p_store_id, p_actor);
  END IF;

  v_summary := public.erp_audit_sale_cogs_gl_summary(v_from, v_to, p_store_id);

  FOR r IN
    SELECT i.id
    FROM public.invoices i
    WHERE i.status IN ('issued', 'partial', 'paid')
      AND COALESCE(i.issued_at::date, i.created_at::date) BETWEEN v_from AND v_to
      AND (p_store_id IS NULL OR i.store_id = p_store_id)
      AND public.erp_invoice_recognized_cogs_total(i.id) - public.erp_invoice_posted_cogs_gl_total(i.id) > 0.01
      AND public.erp_invoice_has_posted_revenue_journal(i.id)
    ORDER BY COALESCE(i.issued_at, i.created_at)
    LIMIT p_limit
  LOOP
    v_one := public.erp_post_invoice_cogs_backfill(r.id, p_actor, p_dry_run);
    v_invoice_results := v_invoice_results || jsonb_build_array(v_one);

    CASE v_one ->> 'action'
      WHEN 'posted' THEN
        v_posted_count := v_posted_count + 1;
        v_cogs_delta := v_cogs_delta + COALESCE((v_one ->> 'amount')::numeric, 0);
      WHEN 'would_post' THEN
        v_would_post_count := v_would_post_count + 1;
        v_cogs_delta := v_cogs_delta + COALESCE((v_one ->> 'gap')::numeric, 0);
      WHEN 'manual_review' THEN
        v_review_count := v_review_count + 1;
      ELSE
        v_skipped_count := v_skipped_count + 1;
    END CASE;
  END LOOP;

  IF p_include_credit_notes THEN
    FOR r IN
      SELECT cn.id
      FROM public.erp_credit_notes cn
      WHERE cn.status IN ('issued', 'applied')
        AND cn.credit_note_date BETWEEN v_from AND v_to
        AND (p_store_id IS NULL OR cn.store_id = p_store_id)
        AND public.erp_credit_note_recognized_cogs_total(cn.id, cn.store_id)
          - public.erp_credit_note_posted_cogs_gl_total(cn.id) > 0.01
      ORDER BY cn.credit_note_date
      LIMIT p_limit
    LOOP
      v_one := public.erp_post_credit_note_cogs_backfill(r.id, p_actor, p_dry_run);
      v_cn_results := v_cn_results || jsonb_build_array(v_one);

      CASE v_one ->> 'action'
        WHEN 'posted' THEN v_posted_count := v_posted_count + 1;
        WHEN 'would_post' THEN v_would_post_count := v_would_post_count + 1;
        WHEN 'manual_review' THEN v_review_count := v_review_count + 1;
        ELSE v_skipped_count := v_skipped_count + 1;
      END CASE;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'date_from', v_from,
    'date_to', v_to,
    'store_id', p_store_id,
    'limit', p_limit,
    'summary_before', v_summary,
    'proposed_cogs_debit_delta', ROUND(v_cogs_delta, 2),
    'proposed_stock_credit_delta', ROUND(v_cogs_delta, 2),
    'counts', jsonb_build_object(
      'posted', v_posted_count,
      'would_post', v_would_post_count,
      'skipped_or_correct', v_skipped_count,
      'manual_review', v_review_count
    ),
    'invoices', v_invoice_results,
    'credit_notes', v_cn_results,
    'note', 'Uncosted lines (pending_cost_qty) are excluded from expected COGS until cost is known. Rerun with p_dry_run=false only after review.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.erp_invoice_posted_cogs_gl_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_credit_note_posted_cogs_gl_total(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_invoice_has_posted_revenue_journal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_audit_sale_cogs_gl_summary(date, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_invoice_line_cogs_backfill_rows(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_post_invoice_cogs_backfill(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_post_credit_note_cogs_backfill(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_backfill_sale_cogs_gl(date, date, uuid, integer, boolean, boolean, uuid) TO authenticated;

COMMIT;
