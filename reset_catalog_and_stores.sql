-- =============================================================================
-- reset_catalog_and_stores.sql — catalog wipe + finance/HR ops + extra stores
-- =============================================================================
--
-- ⚠️  MORE destructive than reset_ops.sql. DEV / staging only. Backup first.
-- Run whole script in Supabase SQL Editor as postgres / service_role.
--
-- DOES:
--   • Clears payments, VAT returns/payments, journals, payslips, payroll runs
--   • Removes all products, variants, media, categories, brands, pricing rules
--   • Truncates inventory rows (SPI, store_inventory, online inventory)
--   • Deletes all erp_employees
--   • Deletes every store except the main store (stores.is_default = true)
--     — typically removes "Store A" / "Store B" if they are not default
--
-- KEEPS:
--   companies, main store (is_default), chart of accounts, vendors, customers,
--   staff users, RBAC, app_settings (default_store_id repointed to main),
--   erp_landed_cost_items, erp_salesmen, tax_rates, item_units, push templates
--
-- BEFORE RUNNING — confirm which store is kept:
--   SELECT id, name, code, is_default FROM public.stores ORDER BY is_default DESC, name;
-- If the wrong row is default, fix it first:
--   UPDATE public.stores SET is_default = false;
--   UPDATE public.stores SET is_default = true WHERE id = '<main-store-uuid>';
-- =============================================================================

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('dhoom_manage_reset_catalog_and_stores'));

-- ─── 1. Break journal FKs ───────────────────────────────────────────────────

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

-- ─── 2. RESTRICT idempotency children ───────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.pos_checkout_operations') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.pos_checkout_operations RESTART IDENTITY';
  END IF;
  IF to_regclass('public.purchase_po_delivery_operations') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.purchase_po_delivery_operations RESTART IDENTITY';
  END IF;
END $$;

-- ─── 3. Operational + catalog tables ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_catalog_and_stores_truncate()
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  existing_tables text;
  tables text[] := ARRAY[
    'erp_client_operations',
    'pos_checkout_operations',
    'purchase_po_delivery_operations',
    'catalog_product_create_operations',
    'erp_spi_wac_repair_runs',
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
    'order_fulfillment_items',
    'order_fulfillments',
    'order_items',
    'orders',
    'shopping_list_items',
    'shopping_lists',
    'returns',
    'cart_items',
    'carts',
    'transactions',
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
    'erp_vat_payments',
    'erp_vat_returns',
    'erp_account_transactions',
    'journal_entry_lines',
    'journal_entries',
    'erp_fixed_assets',
    'erp_pay_slips',
    'erp_salary_payments',
    'erp_salary_bulk_payments',
    'erp_employee_ledger',
    'erp_employee_opening_balance_lines',
    'erp_employee_opening_balance_batches',
    'erp_recurring_schedules',
    'audit_logs',
    'notifications',
    'product_view_reach',
    'cart_reach',
    'order_funnel_reach',
    'push_campaigns',
    -- Catalog / inventory (items wiped)
    'variant_images',
    'product_variants',
    'variant_groups',
    'product_images',
    'product_videos',
    'pricing_rules',
    'vendor_products',
    'vendor_pricing_overrides',
    'products',
    'categories',
    'brands',
    'store_product_inventory',
    'store_inventory',
    'inventory'
  ];
BEGIN
  SELECT string_agg(format('public.%I', t), ', ' ORDER BY t)
  INTO existing_tables
  FROM unnest(tables) AS u(t)
  WHERE to_regclass('public.' || t) IS NOT NULL;

  IF existing_tables IS NULL OR existing_tables = '' THEN
    RAISE EXCEPTION 'reset_catalog_and_stores: no tables found to truncate';
  END IF;

  EXECUTE 'TRUNCATE TABLE ' || existing_tables || ' RESTART IDENTITY CASCADE';
  RAISE NOTICE 'Truncated (CASCADE): %', existing_tables;
END;
$$;

SELECT public.reset_catalog_and_stores_truncate();
DROP FUNCTION public.reset_catalog_and_stores_truncate();

-- ─── 4. Employees (profiles removed; payroll tables already empty) ───────────

DO $$
BEGIN
  IF to_regclass('public.erp_employees') IS NOT NULL THEN
    DELETE FROM public.erp_employees;
  END IF;
END $$;

-- ─── 5. Wallet zero (rows kept) ────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.wallet') IS NOT NULL THEN
    UPDATE public.wallet SET balance = 0, updated_at = now();
  END IF;
END $$;

-- ─── 6. Document counters ──────────────────────────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.erp_document_sequences') IS NOT NULL THEN
    UPDATE public.erp_document_sequences SET next_number = 1, updated_at = now();
    UPDATE public.erp_document_sequences
    SET next_number = 101, updated_at = now()
    WHERE document_type IN ('vat_return', 'vat_payment');
  END IF;
END $$;

-- ─── 7. Keep main store only; drop Store A / Store B (and any other non-default)

DO $$
DECLARE
  v_keep uuid;
  v_deleted int;
BEGIN
  SELECT id INTO v_keep
  FROM public.stores
  WHERE is_default = true
  ORDER BY created_at
  LIMIT 1;

  IF v_keep IS NULL THEN
    RAISE EXCEPTION
      'No main store (is_default = true). Set default on the store to keep, then re-run.';
  END IF;

  UPDATE public.app_settings
  SET default_store_id = v_keep
  WHERE id = 1;

  UPDATE public.user_erp_preferences
  SET active_store_id = v_keep
  WHERE active_store_id IS DISTINCT FROM v_keep
    AND active_store_id IS NOT NULL;

  DELETE FROM public.user_store_access
  WHERE store_id IS DISTINCT FROM v_keep;

  DELETE FROM public.stores
  WHERE id IS DISTINCT FROM v_keep;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'Main store kept: %. Other stores deleted: %', v_keep, v_deleted;
END $$;

COMMIT;

-- ─── Verify ────────────────────────────────────────────────────────────────

SELECT 'stores' AS entity, count(*)::bigint AS rows FROM public.stores
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'categories', count(*) FROM public.categories
UNION ALL SELECT 'brands', count(*) FROM public.brands
UNION ALL SELECT 'store_product_inventory', count(*) FROM public.store_product_inventory
UNION ALL SELECT 'erp_employees', count(*) FROM public.erp_employees
UNION ALL SELECT 'erp_customer_payments', count(*) FROM public.erp_customer_payments
UNION ALL SELECT 'erp_supplier_payments', count(*) FROM public.erp_supplier_payments
UNION ALL SELECT 'erp_vat_returns', count(*) FROM public.erp_vat_returns
UNION ALL SELECT 'erp_vat_payments', count(*) FROM public.erp_vat_payments
UNION ALL SELECT 'erp_pay_slips', count(*) FROM public.erp_pay_slips
UNION ALL SELECT 'journal_entries', count(*) FROM public.journal_entries
ORDER BY entity;

SELECT id, name, code, is_default FROM public.stores;
