-- =============================================================================
-- INV-9A400 historical COGS true-up (Store A) — APPROVAL REQUIRED TO POST
-- =============================================================================
-- Verified live: policy COGS ₹940, posted ₹800, gap ₹140; SPI ₹1,410; STOCK GL ₹1,550.
-- Does NOT modify JE-97D35 (invoice) or JE-654B4 (purchase bill).
--
-- Prerequisites:
--   1) Migrations 20261026250400, 26250600, 26250700, 26250800 applied
--   2) Finance sign-off recorded (ticket / email / audit log)
--   3) p_actor must be a REAL uuid from public.users (admin/manager) — never the placeholder text
--
-- Resolve staff id (SQL editor):
--   SELECT id, email, role FROM public.users WHERE role IN ('admin', 'manager') ORDER BY email;
--
-- Idempotency: one posted journal per invoice via
--   source_entity_type = 'invoice_net_acquisition_cogs_trueup'
--   source_entity_id   = invoice uuid
-- =============================================================================

-- ─── READ-ONLY: pre-flight (run anytime) ───────────────────────────────────

SELECT public.erp_audit_invoice_cogs_trueup('9a400491-61de-40fd-bf6b-67faeaabb7a0');

SELECT *
FROM public.get_erp_stock_gl_wac_recon_report('eed2fe05-36a9-492f-9bde-34d5023e2226');

SELECT je.id, je.journal_number, je.source_entity_type, je.total_debit, je.status
FROM public.journal_entries je
WHERE je.source_entity_id = '9a400491-61de-40fd-bf6b-67faeaabb7a0'
   OR je.source_entity_type IN (
        'invoice_net_acquisition_cogs_trueup',
        'invoice_cogs_backfill'
      );

-- Independent quantity check (expect 4 mug issues, 2 shirt; no return rows)
SELECT product_id, quantity, reference_type, reference_id
FROM public.stock_movements
WHERE store_id = 'eed2fe05-36a9-492f-9bde-34d5023e2226'
  AND reference_id IN (
    '9a400491-61de-40fd-bf6b-67faeaabb7a0',
    '38ce7467-c8fa-4997-b35a-4df603c3a795'
  )
ORDER BY created_at;

-- ─── DRY-RUN (default; safe to run) ────────────────────────────────────────

SELECT public.erp_post_invoice_net_acquisition_cogs_trueup(
  '9a400491-61de-40fd-bf6b-67faeaabb7a0'::uuid,
  '04f4255e-c3bf-4654-a537-2ec3a940b30f'::uuid,  -- example; use your approver from users query above
  true
);

-- Expected dry-run JSON includes:
--   "action": "would_post"
--   "amount": 140
--   "description": "COGS true-up INV-9A400 — net acquisition policy"

-- =============================================================================
-- POSTING BLOCK — UNCOMMENT ONLY AFTER EXPLICIT FINANCE APPROVAL
-- =============================================================================
/*
BEGIN;

SELECT public.erp_post_invoice_net_acquisition_cogs_trueup(
  '9a400491-61de-40fd-bf6b-67faeaabb7a0'::uuid,
  '04f4255e-c3bf-4654-a537-2ec3a940b30f'::uuid,  -- approver staff user
  false
) AS post_result;

-- Must return action = 'posted' and amount = 140 exactly once.

COMMIT;
*/

-- ─── POST-VERIFICATION (after approved post) ───────────────────────────────

-- SELECT public.erp_audit_invoice_cogs_trueup('9a400491-61de-40fd-bf6b-67faeaabb7a0');
--   → proposed_cogs_adjustment should be 0 (or ≤ 0.01)

-- SELECT * FROM public.get_erp_stock_gl_wac_recon_report('eed2fe05-36a9-492f-9bde-34d5023e2226');
--   → in_sync true, gl_balance 1410, wac_value 1410, variance 0

-- SELECT je.journal_number, jel.debit_amount, jel.credit_amount, a.code
-- FROM public.journal_entries je
-- JOIN public.journal_entry_lines jel ON jel.journal_entry_id = je.id
-- JOIN public.accounts a ON a.id = jel.account_id
-- WHERE je.source_entity_type = 'invoice_net_acquisition_cogs_trueup'
--   AND je.source_entity_id = '9a400491-61de-40fd-bf6b-67faeaabb7a0';
