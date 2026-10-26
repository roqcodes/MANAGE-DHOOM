-- Store A P&L COGS diagnostic (read-only). Adjust dates to match the P&L report filter.
-- Store A id: eed2fe05-36a9-492f-9bde-34d5023e2226
-- Query (2) needs migration 20261026251100_profit_and_loss_sql_editor_auth.sql (postgres has no staff JWT).

-- 1) Posted COGS lines with journal vs document dates
SELECT
  je.journal_number,
  je.transaction_date AS je_date,
  je.store_id AS je_store_id,
  public.erp_resolved_journal_store_id(je.id) AS resolved_store_id,
  je.source_entity_type,
  je.description,
  a.code AS account_code,
  t.name AS account_type_name,
  jel.debit_amount,
  jel.credit_amount,
  cn.credit_note_number,
  cn.credit_note_date AS cn_doc_date,
  i.invoice_number,
  COALESCE(i.issued_at::date, i.created_at::date) AS invoice_doc_date
FROM public.journal_entry_lines jel
JOIN public.journal_entries je ON je.id = jel.journal_entry_id
JOIN public.accounts a ON a.id = jel.account_id
JOIN public.account_types t ON t.id = a.account_type_id
LEFT JOIN public.erp_credit_notes cn
  ON cn.id = je.source_entity_id
  AND je.source_entity_type IN ('credit_note', 'credit_note_cogs_backfill')
LEFT JOIN public.invoices i
  ON i.id = je.source_entity_id
  AND je.source_entity_type IN ('invoice', 'invoice_net_acquisition_cogs_trueup', 'invoice_cogs_backfill')
WHERE je.status = 'posted'
  AND (
    a.code = 'COST_OF_GOODS_SOLD'
    OR t.name = 'Cost of Goods Sold'
  )
  AND public.erp_resolved_journal_store_id(je.id) = 'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid
ORDER BY je.transaction_date, je.journal_number, jel.line_order;

-- 2) RPC totals (use same from/to as the report UI)
SELECT public.get_erp_profit_and_loss(
  '2026-10-26'::date,
  '2026-10-27'::date,
  'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid
);

-- 3) Lines that match current P&L COGS rules for 2026-10-26 .. 2026-10-27 (should net to total_cogs)
WITH params AS (
  SELECT
    '2026-10-26'::date AS date_from,
    '2026-10-27'::date AS date_to,
    'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid AS store_id
)
SELECT
  je.journal_number,
  je.transaction_date,
  je.source_entity_type,
  je.description,
  jel.debit_amount,
  jel.credit_amount,
  ROUND(jel.debit_amount - jel.credit_amount, 2) AS net_cogs_line
FROM public.journal_entry_lines jel
JOIN public.journal_entries je ON je.id = jel.journal_entry_id
JOIN public.accounts a ON a.id = jel.account_id
JOIN public.account_types t ON t.id = a.account_type_id
CROSS JOIN params p
WHERE je.status = 'posted'
  AND a.is_active = true
  AND (
    (t.account_category = 'Expense' AND t.name = 'Cost of Goods Sold')
    OR a.code = 'COST_OF_GOODS_SOLD'
  )
  AND public.erp_resolved_journal_store_id(je.id) = p.store_id
  AND (
    je.transaction_date BETWEEN p.date_from AND p.date_to
    OR (
      jel.credit_amount > 0.001
      AND je.source_entity_type IN ('credit_note', 'credit_note_cogs_backfill')
      AND EXISTS (
        SELECT 1
        FROM public.erp_credit_notes cn
        WHERE cn.id = je.source_entity_id
          AND cn.credit_note_date BETWEEN p.date_from AND p.date_to
      )
    )
  )
ORDER BY je.transaction_date, je.journal_number, jel.line_order;

-- 4) P&L COGS net (should equal total_cogs from query 2)
WITH params AS (
  SELECT
    '2026-10-26'::date AS date_from,
    '2026-10-27'::date AS date_to,
    'eed2fe05-36a9-492f-9bde-34d5023e2226'::uuid AS store_id
)
SELECT ROUND(
  COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0),
  2
) AS pl_cogs_net
FROM public.journal_entry_lines jel
JOIN public.journal_entries je ON je.id = jel.journal_entry_id
JOIN public.accounts a ON a.id = jel.account_id
JOIN public.account_types t ON t.id = a.account_type_id
CROSS JOIN params p
WHERE je.status = 'posted'
  AND a.is_active = true
  AND (
    (t.account_category = 'Expense' AND t.name = 'Cost of Goods Sold')
    OR a.code = 'COST_OF_GOODS_SOLD'
  )
  AND public.erp_resolved_journal_store_id(je.id) = p.store_id
  AND (
    je.transaction_date BETWEEN p.date_from AND p.date_to
    OR (
      jel.credit_amount > 0.001
      AND je.source_entity_type IN ('credit_note', 'credit_note_cogs_backfill')
      AND EXISTS (
        SELECT 1
        FROM public.erp_credit_notes cn
        WHERE cn.id = je.source_entity_id
          AND cn.credit_note_date BETWEEN p.date_from AND p.date_to
      )
    )
  );
