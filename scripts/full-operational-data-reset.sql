-- =============================================================================
-- BUYHUB / BH-MANAGE — FULL OPERATIONAL DATA RESET
-- =============================================================================
--
-- ⚠️  DESTRUCTIVE. Back up first. Cannot undo.
-- Run in Supabase SQL Editor as postgres / service_role.
-- Execute the whole transaction: from BEGIN through COMMIT (step 1 pre-truncate is required).
--
-- Clears ALL transactional data (storefront + ERP + accounting + inventory ops).
-- Shared public schema — affects both buyhub app and bh-manage admin.
--
-- ─── KEPT (masters / config) ───────────────────────────────────────────────
--   users, companies, stores, user_store_access, user_erp_preferences
--   products, product_variants, variant_groups, categories, brands, media
--   vendors, vendor_products, vendor_pricing_overrides
--   accounts, account_types, erp_posting_rules, erp_landed_cost_items
--   tax_rates, item_units, pricing_rules, app_settings
--   erp_document_sequences (rows kept; counters reset)
--   erp_employees, erp_recurring_schedules
--   push_tokens, push_templates, notification_preferences
--   customer_credit_limits (optional — included in truncate below; comment out)
--   addresses (optional — included in truncate below; comment out to keep)
--
-- ─── CLEARED (operational) ─────────────────────────────────────────────────
--   Carts, orders, wallet, invoices, returns, shopping lists
--   ERP sales: estimates, credit notes, customer payments
--   ERP purchases: POs, bills, receives, supplier payments, vendor credits, expenses
--   Inventory: stock movements, store_inventory, store_product_inventory,
--              adjustments, transfers, online transfers
--   Accounting: journals, account transactions, VAT returns/payments, fixed assets
--   HR payroll runs (employees kept)
--   Audit logs, analytics reach tables, push campaigns, notifications
--   Idempotency ledgers: pos_checkout_operations, purchase_po_delivery_operations
--
-- =============================================================================

BEGIN;

-- ─── 1. RESTRICT FK children (must empty before orders / PO bills / receives) ─
-- Phase 2: pos_checkout_operations → orders (ON DELETE RESTRICT)
-- Phase 3: purchase_po_delivery_operations → po, bill, receive (ON DELETE RESTRICT)

DO $pre$
BEGIN
  IF to_regclass('public.pos_checkout_operations') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.pos_checkout_operations RESTART IDENTITY';
  END IF;
  IF to_regclass('public.purchase_po_delivery_operations') IS NOT NULL THEN
    EXECUTE 'TRUNCATE TABLE public.purchase_po_delivery_operations RESTART IDENTITY';
  END IF;
END $pre$;

-- ─── 2. Truncate all other operational tables (one statement + CASCADE) ─────

TRUNCATE TABLE
  -- Online → physical + online pool transfers
  public.online_to_physical_transfer_lines,
  public.online_to_physical_transfers,
  public.online_stock_transfer_allocations,
  public.online_stock_transfers,
  -- Orders / invoicing (include all dependents; orders.invoice_id ↔ invoices.order_id)
  public.order_fulfillment_items,
  public.order_fulfillments,
  public.order_funnel_reach,
  public.order_items,
  public.invoice_items,
  public.invoices,
  public.orders,
  public.returns,
  -- Storefront session / wallet
  public.cart_items,
  public.carts,
  public.cart_reach,
  public.shopping_list_items,
  public.shopping_lists,
  public.transactions,
  public.wallet,
  public.addresses,                    -- comment out to keep customer addresses
  public.notifications,
  public.push_campaigns,
  public.product_view_reach,
  -- Stock movement log + physical per-store inventory
  public.stock_movements,
  public.store_product_inventory,
  public.store_inventory,
  -- Purchasing (purchase_po_delivery_operations cleared in step 1)
  public.purchase_order_landed_costs,
  public.purchase_order_items,
  public.purchase_orders,
  public.erp_purchase_bill_landed_costs,
  public.erp_purchase_bill_lines,
  public.erp_purchase_bills,
  public.erp_purchase_receive_lines,
  public.erp_purchase_receives,
  public.erp_vendor_credit_lines,
  public.erp_vendor_credit_applications,
  public.erp_vendor_credits,
  public.erp_supplier_payment_allocations,
  public.erp_supplier_payments,
  public.erp_expenses,
  -- ERP sales
  public.erp_estimate_lines,
  public.erp_estimates,
  public.erp_credit_note_lines,
  public.erp_credit_notes,
  public.erp_credit_note_applications,
  public.erp_payment_allocations,
  public.erp_customer_payments,
  -- Inventory documents
  public.erp_stock_adjustment_lines,
  public.erp_stock_adjustments,
  public.erp_store_transfer_lines,
  public.erp_transfer_request_lines,
  public.erp_transfer_payments,
  public.erp_store_transfers,
  public.erp_transfer_requests,
  -- Accounting
  public.journal_entry_lines,
  public.journal_entries,
  public.erp_account_transactions,
  public.erp_vat_payments,
  public.erp_vat_returns,
  public.erp_fixed_assets,
  -- HR payroll runs (erp_employees kept)
  public.erp_pay_slips,
  public.erp_employee_ledger,
  public.erp_salary_payments,
  public.erp_salary_bulk_payments,
  public.erp_employee_opening_balance_lines,
  public.erp_employee_opening_balance_batches,
  -- Audit + customer ops
  public.audit_logs,
  public.customer_credit_limits          -- comment out to keep credit limits
RESTART IDENTITY CASCADE;

-- ─── 3. Reset online (variant-level) inventory balances ─────────────────────
-- Rows kept (per store × variant); quantities zeroed.

UPDATE public.inventory
SET
  stock = 0,
  reserved_stock = 0,
  last_reorder_quantity = NULL,
  updated_at = now();

-- Optional: reset vendor supply stock on vendor_products
-- UPDATE public.vendor_products SET stock = 0, updated_at = now();

-- ─── 4. Reset ERP document number counters ──────────────────────────────────

UPDATE public.erp_document_sequences
SET next_number = 1, updated_at = now();

-- VAT docs seeded at 101 in migrations
UPDATE public.erp_document_sequences
SET next_number = 101, updated_at = now()
WHERE document_type IN ('vat_return', 'vat_payment');

-- ─── 5. Reset customer opening balances ─────────────────────────────────────

UPDATE public.users
SET opening_balance = 0
WHERE opening_balance IS DISTINCT FROM 0;

-- ─── 6. Clean up integration test stores (optional) ─────────────────────────

UPDATE public.app_settings
SET default_store_id = (
  SELECT s.id
  FROM public.stores s
  WHERE s.is_active = true
    AND NOT (s.code IN ('TSTA', 'TSTB') OR s.name LIKE 'TEST-STORE-%')
  ORDER BY s.is_default DESC NULLS LAST, s.created_at
  LIMIT 1
)
WHERE id = 1
  AND default_store_id IN (
    SELECT id FROM public.stores
    WHERE code IN ('TSTA', 'TSTB') OR name LIKE 'TEST-STORE-%'
  );

UPDATE public.app_settings
SET default_store_id = NULL
WHERE id = 1
  AND default_store_id IN (
    SELECT id FROM public.stores
    WHERE code IN ('TSTA', 'TSTB') OR name LIKE 'TEST-STORE-%'
  );

UPDATE public.user_erp_preferences
SET active_store_id = NULL
WHERE active_store_id IN (
  SELECT id FROM public.stores
  WHERE code IN ('TSTA', 'TSTB') OR name LIKE 'TEST-STORE-%'
);

DELETE FROM public.user_store_access
WHERE store_id IN (
  SELECT id FROM public.stores
  WHERE code IN ('TSTA', 'TSTB') OR name LIKE 'TEST-STORE-%'
);

DELETE FROM public.stores
WHERE code IN ('TSTA', 'TSTB') OR name LIKE 'TEST-STORE-%';

UPDATE public.app_settings
SET default_store_id = (
  SELECT s.id
  FROM public.stores s
  WHERE s.is_active = true
  ORDER BY s.is_default DESC NULLS LAST, s.created_at
  LIMIT 1
)
WHERE id = 1
  AND default_store_id IS NULL
  AND EXISTS (SELECT 1 FROM public.stores s WHERE s.is_active = true);

COMMIT;

-- =============================================================================
-- VERIFICATION — all operational counts should be 0; masters should remain
-- =============================================================================

SELECT 'orders' AS entity, count(*)::bigint AS rows FROM public.orders
UNION ALL SELECT 'invoices', count(*) FROM public.invoices
UNION ALL SELECT 'purchase_orders', count(*) FROM public.purchase_orders
UNION ALL SELECT 'erp_purchase_bills', count(*) FROM public.erp_purchase_bills
UNION ALL SELECT 'erp_purchase_receives', count(*) FROM public.erp_purchase_receives
UNION ALL SELECT 'journal_entries', count(*) FROM public.journal_entries
UNION ALL SELECT 'erp_account_transactions', count(*) FROM public.erp_account_transactions
UNION ALL SELECT 'stock_movements', count(*) FROM public.stock_movements
UNION ALL SELECT 'store_product_inventory', count(*) FROM public.store_product_inventory
UNION ALL SELECT 'store_inventory', count(*) FROM public.store_inventory
UNION ALL SELECT 'inventory_online_rows', count(*) FROM public.inventory WHERE stock <> 0 OR reserved_stock <> 0
UNION ALL SELECT 'carts', count(*) FROM public.carts
UNION ALL SELECT 'wallet', count(*) FROM public.wallet
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs
UNION ALL SELECT 'erp_estimates', count(*) FROM public.erp_estimates
UNION ALL SELECT 'erp_credit_notes', count(*) FROM public.erp_credit_notes
UNION ALL SELECT 'erp_salary_payments', count(*) FROM public.erp_salary_payments
UNION ALL SELECT 'push_campaigns', count(*) FROM public.push_campaigns
UNION ALL SELECT 'pos_checkout_operations', count(*) FROM public.pos_checkout_operations
UNION ALL SELECT 'purchase_po_delivery_operations', count(*) FROM public.purchase_po_delivery_operations
UNION ALL SELECT '--- masters ---', NULL::bigint
UNION ALL SELECT 'users', count(*) FROM public.users
UNION ALL SELECT 'products', count(*) FROM public.products
UNION ALL SELECT 'product_variants', count(*) FROM public.product_variants
UNION ALL SELECT 'vendors', count(*) FROM public.vendors
UNION ALL SELECT 'stores', count(*) FROM public.stores
UNION ALL SELECT 'accounts', count(*) FROM public.accounts
UNION ALL SELECT 'erp_employees', count(*) FROM public.erp_employees
ORDER BY entity;

-- Document counters (spot-check)
SELECT document_type, prefix, next_number
FROM public.erp_document_sequences
ORDER BY document_type;
