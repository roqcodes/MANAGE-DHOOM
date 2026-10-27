-- =============================================================================
-- reset_ops.sql — wipe operational / transactional data (DEV & staging only)
-- =============================================================================
--
-- Run in Supabase SQL Editor (service_role) or: psql ... -f reset_ops.sql
--
-- KEEPS (master / config):
--   products, variants, categories, brands, media, vendors, customers (users),
--   companies, stores, staff/RBAC, chart of accounts (accounts, account_types),
--   erp_posting_rules, erp_landed_cost_items, erp_employees (profiles),
--   erp_salesmen (PIN sellers; not transactional),
--   item_units, tax_rates, pricing_rules, app_settings, erp_purchasing_settings,
--   push_templates, push_tokens, notification_preferences,
--   customer_credit_limits (limits only), addresses (optional).
--
-- CLEARS:
--   sales & purchase documents, payments, journals, VAT, deferred COGS postings,
--   per-store party openings (erp_party_store_openings),
--   inventory movements, stock levels (zeroed; store WAC/sales overrides cleared),
--   storefront carts/orders/wishlists, HR payroll runs, sync ops,
--   audit trail, analytics reach tables, idempotency rows, document counters,
--   SPI WAC repair audit runs.
--
-- MAINTENANCE: When a migration adds/changes transactional tables, append them
-- to reset_ops_truncate_tables() below (newest migrations first in list is ok;
-- children must appear before parents). Recent tables to remember:
--   - erp_spi_wac_repair_runs (20261026220000) — WAC repair dry-run/apply log
--   - erp_party_store_openings (20261022190000) — per-store AR/AP openings
--   - erp_invoice_deferred_cogs_postings (20261020160000)
--   - catalog_product_create_operations (20261019210000)
--   - erp_client_operations (20261003120000)
--   - pos_checkout_operations (20261002140000)
--   - purchase_po_delivery_operations (20261002170000)
--   - purchase_order_landed_costs (20261001140000)
--   - erp_purchase_receives / lines (20260907130000)
--   - shopping_lists / shopping_list_items (storefront wishlists)
-- Migrations 20261026250000–20261027141408: no new transactional tables (RPC/policy only).
-- Last reviewed: 2026-10-27 (through 20261027141408_receipt_cost_skip_negative_onhand)
--
-- ⚠️  Destructive. Backup before running in any shared environment.
-- =============================================================================

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dhoom_manage_reset_operational_data'));

-- ─── Drop journal pointers so ledger rows can be removed ───────────────────

DO $$
BEGIN
  IF to_regclass('public.erp_vat_returns') IS NOT NULL THEN
    UPDATE public.erp_vat_returns SET journal_entry_id = NULL WHERE journal_entry_id IS NOT NULL;
  END IF;
  IF to_regclass('public.erp_fixed_assets') IS NOT NULL THEN
    UPDATE public.erp_fixed_assets SET journal_entry_id = NULL WHERE journal_entry_id IS NOT NULL;
  END IF;
  IF to_regclass('public.erp_pay_slips') IS NOT NULL THEN
    UPDATE public.erp_pay_slips SET journal_entry_id = NULL WHERE journal_entry_id IS NOT NULL;
  END IF;
  IF to_regclass('public.erp_account_transactions') IS NOT NULL THEN
    UPDATE public.erp_account_transactions SET journal_entry_id = NULL WHERE journal_entry_id IS NOT NULL;
  END IF;
  IF to_regclass('public.erp_invoice_deferred_cogs_postings') IS NOT NULL THEN
    UPDATE public.erp_invoice_deferred_cogs_postings
    SET journal_entry_id = NULL
    WHERE journal_entry_id IS NOT NULL;
  END IF;
END $$;

-- ─── RESTRICT FK children (truncate alone before the main batch) ───────────

DO $$
BEGIN
  IF to_regclass('public.pos_checkout_operations') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.pos_checkout_operations RESTART IDENTITY';
  END IF;
  IF to_regclass('public.purchase_po_delivery_operations') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.purchase_po_delivery_operations RESTART IDENTITY';
  END IF;
END $$;

-- ─── Truncate operational tables (children before parents) ─────────────────

CREATE OR REPLACE FUNCTION public.reset_ops_truncate_tables()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing_tables text;
  tables text[] := ARRAY[
    -- Idempotency / checkout helpers
    'erp_client_operations',
    'pos_checkout_operations',
    'purchase_po_delivery_operations',
    'catalog_product_create_operations',
    -- Inventory repair audit (20261026220000)
    'erp_spi_wac_repair_runs',
    -- AR allocations & payments
    'erp_party_store_openings',
    'erp_invoice_deferred_cogs_postings',
    'erp_payment_allocations',
    'erp_customer_payments',
    'erp_credit_note_applications',
    'erp_credit_note_lines',
    'erp_credit_notes',
    'invoice_items',
    'invoices',
    'erp_estimate_lines',
    'erp_estimates',
    -- AP allocations & payments
    'erp_supplier_payment_allocations',
    'erp_supplier_payments',
    'erp_vendor_credit_applications',
    'erp_vendor_credit_lines',
    'erp_vendor_credits',
    'erp_purchase_bill_landed_costs',
    'erp_purchase_bill_lines',
    'erp_purchase_bills',
    'erp_purchase_receive_lines',
    'erp_purchase_receives',
    'purchase_order_landed_costs',
    'purchase_order_items',
    'purchase_orders',
    'erp_expenses',
    -- Sales / storefront orders
    'order_fulfillment_items',
    'order_fulfillments',
    'order_items',
    'orders',
    'shopping_list_items',
    'shopping_lists',
    -- Inventory ops
    'erp_transfer_payments',
    'erp_store_transfer_lines',
    'erp_store_transfers',
    'erp_transfer_request_lines',
    'erp_transfer_requests',
    'erp_stock_adjustment_lines',
    'erp_stock_adjustments',
    'online_stock_transfer_allocations',
    'online_stock_transfers',
    'online_to_physical_transfer_lines',
    'online_to_physical_transfers',
    'stock_movements',
    -- Finance
    'erp_vat_payments',
    'erp_vat_returns',
    'erp_account_transactions',
    'journal_entry_lines',
    'journal_entries',
    'erp_fixed_assets',
    -- HR payroll (keeps erp_employees)
    'erp_pay_slips',
    'erp_salary_payments',
    'erp_salary_bulk_payments',
    'erp_employee_ledger',
    'erp_employee_opening_balance_lines',
    'erp_employee_opening_balance_batches',
    -- Productivity / recurring doc templates (re-create in UI if needed)
    'erp_recurring_schedules',
    -- Storefront / wallet / returns
    'returns',
    'cart_items',
    'carts',
    'transactions',
    -- Observability & campaigns (not device tokens / templates)
    'audit_logs',
    'notifications',
    'product_view_reach',
    'cart_reach',
    'order_funnel_reach',
    'push_campaigns'
  ];
BEGIN
  SELECT string_agg(format('public.%I', t), ', ' ORDER BY t)
  INTO existing_tables
  FROM unnest(tables) AS u(t)
  WHERE to_regclass('public.' || t) IS NOT NULL;

  IF existing_tables IS NULL OR existing_tables = '' THEN
    RAISE NOTICE 'reset_ops: no operational tables found to truncate';
    RETURN;
  END IF;

  -- One TRUNCATE + CASCADE respects cross-table FKs (per-table TRUNCATE fails otherwise).
  EXECUTE 'TRUNCATE TABLE ' || existing_tables || ' RESTART IDENTITY CASCADE';
  RAISE NOTICE 'Truncated (CASCADE): %', existing_tables;
END;
$$;

SELECT public.reset_ops_truncate_tables();

DROP FUNCTION public.reset_ops_truncate_tables();

-- ─── Zero inventory (products & stores remain) ───────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.store_product_inventory') IS NOT NULL THEN
    UPDATE public.store_product_inventory
    SET
      stock = 0,
      opening_stock = 0,
      purchase_price = NULL,
      sales_price = NULL,
      updated_at = now();
  END IF;
  IF to_regclass('public.store_inventory') IS NOT NULL THEN
    UPDATE public.store_inventory
    SET
      stock = 0,
      opening_stock = 0,
      reserved_stock = 0,
      purchase_price = NULL,
      sales_price = NULL,
      updated_at = now();
  END IF;
  IF to_regclass('public.inventory') IS NOT NULL THEN
    UPDATE public.inventory
    SET
      stock = 0,
      reserved_stock = 0,
      last_reorder_quantity = NULL,
      updated_at = now();
  END IF;
  IF to_regclass('public.vendor_products') IS NOT NULL THEN
    UPDATE public.vendor_products SET stock = 0;
  END IF;
END $$;

-- ─── Wallet balances (wallets rows kept) ───────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.wallet') IS NOT NULL THEN
    UPDATE public.wallet SET balance = 0, updated_at = now();
  END IF;
END $$;

-- ─── ERP document numbers (INV-0001, PB-0001, …) ───────────────────────────

DO $$
BEGIN
  IF to_regclass('public.erp_document_sequences') IS NOT NULL THEN
    UPDATE public.erp_document_sequences SET next_number = 1, updated_at = now();
    UPDATE public.erp_document_sequences
    SET next_number = 101, updated_at = now()
    WHERE document_type IN ('vat_return', 'vat_payment');
  END IF;
END $$;

-- Optional: clear vendor/customer opening balances on master records
-- (uncomment if you want AR/AP aging to start from zero on masters too).
-- Per-store openings (erp_party_store_openings) are truncated above.
-- UPDATE public.vendors SET opening_balance = 0, opening_balance_date = NULL;
-- UPDATE public.users SET opening_balance = 0 WHERE opening_balance IS NOT NULL;

COMMIT;

-- Verify (optional):
-- SELECT COUNT(*) FROM public.invoices;
-- SELECT COUNT(*) FROM public.erp_purchase_bills;
-- SELECT COUNT(*) FROM public.journal_entries;
-- SELECT COUNT(*) FROM public.erp_client_operations;
-- SELECT COUNT(*) FROM public.erp_spi_wac_repair_runs;
-- SELECT SUM(stock) FROM public.store_product_inventory;
