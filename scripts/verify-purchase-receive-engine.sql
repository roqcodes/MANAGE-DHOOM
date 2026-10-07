-- Purchase receive engine verification checklist.
-- Run after applying migration 20260907130000_purchase_receives_engine.sql
-- Requires staff auth context in Supabase SQL editor (authenticated role).

-- 1) Bill finalize must NOT call inventory_apply_purchase_bill_stock
SELECT pg_get_functiondef('public.finalize_erp_purchase_bill(uuid,uuid)'::regprocedure)
  LIKE '%inventory_apply_purchase_bill_stock%' AS bill_finalize_still_applies_stock;
-- Expected: false

-- 2) Receive finalize must apply receive stock
SELECT pg_get_functiondef('public.finalize_erp_purchase_receive(uuid,boolean,uuid)'::regprocedure)
  LIKE '%inventory_apply_purchase_receive_stock%' AS receive_finalize_applies_stock;
-- Expected: true

-- 3) Legacy bills flagged
SELECT COUNT(*) AS legacy_bills
FROM public.erp_purchase_bills
WHERE legacy_stock_via_bill = true;

-- 4) Document sequence exists
SELECT * FROM public.erp_document_sequences WHERE document_type = 'purchase_receive';

-- 5) Posting rules
SELECT event_type, is_enabled FROM public.erp_posting_rules
WHERE event_type IN ('purchase_bill', 'purchase_receive');

-- Manual workflow tests (execute in app after seed data):
-- A. Create PO -> stock unchanged on store_inventory
-- B. Create draft bill -> no AP, no stock
-- C. Finalize bill -> balance_due set, journal DR GRNI CR AP, stock unchanged
-- D. Receive 40/100 -> stock +40, movement logged, PO partially_received
-- E. Receive 60/100 -> stock +60 total, PO fully_received
-- F. Receive 95/100 with draft bill reconcile -> bill qty becomes 95
-- G. Over-receive blocked by default policy
-- H. Vendor portal delivered -> no stock movement
-- I. Item stock report shows incoming_qty + expected_stock columns
