-- One-time migration: assign all existing transactional data to STORE-A.
-- Target store: b406b220-2423-4c4f-9f8a-1cbabd9fbe79 (STORE-A / code 10001)
-- Company:      b0d552f3-64ed-4e55-bfe6-2b0997a58046
--
-- Products, vendors, customers, and app settings remain shared.
-- Run once on production after verifying the store id exists.

BEGIN;

DO $$
DECLARE
  v_store_id constant uuid := 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79';
  v_company_id constant uuid := 'b0d552f3-64ed-4e55-bfe6-2b0997a58046';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.stores WHERE id = v_store_id) THEN
    RAISE EXCEPTION 'Migration aborted: store % not found', v_store_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.stores WHERE id = v_store_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'Migration aborted: store % is not linked to company %', v_store_id, v_company_id;
  END IF;
END $$;

-- ─── Defaults & access ────────────────────────────────────────────────────────

UPDATE public.stores
SET is_default = (id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid),
    updated_at = now()
WHERE company_id = 'b0d552f3-64ed-4e55-bfe6-2b0997a58046'::uuid;

UPDATE public.app_settings
SET default_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid,
    default_company_id = 'b0d552f3-64ed-4e55-bfe6-2b0997a58046'::uuid,
    updated_at = now()
WHERE id = 1;

INSERT INTO public.user_erp_preferences (user_id, active_store_id, updated_at)
SELECT u.id, 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid, now()
FROM public.users u
WHERE u.role IN ('admin', 'manager')
ON CONFLICT (user_id) DO UPDATE
SET active_store_id = EXCLUDED.active_store_id,
    updated_at = now();

INSERT INTO public.user_store_access (user_id, store_id, is_default)
SELECT u.id, 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid, true
FROM public.users u
WHERE u.role IN ('admin', 'manager')
ON CONFLICT (user_id, store_id) DO UPDATE
SET is_default = EXCLUDED.is_default;

UPDATE public.user_store_access
SET is_default = (store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid);

-- ─── Sales & billing ────────────────────────────────────────────────────────

UPDATE public.invoices
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_estimates
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_credit_notes
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_customer_payments
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.orders
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.order_fulfillments
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

-- ─── Purchasing ─────────────────────────────────────────────────────────────

UPDATE public.erp_purchase_bills
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_vendor_credits
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_supplier_payments
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_expenses
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.purchase_orders
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

-- ─── Finance & accounting ───────────────────────────────────────────────────

UPDATE public.journal_entries
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_account_transactions
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_fixed_assets
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_vat_returns
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_vat_payments
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_recurring_schedules
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

-- Store-scoped chart accounts (leave intentionally null = company-wide if you add those later)
UPDATE public.accounts
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
  AND store_id IS NOT NULL;

-- ─── Inventory ──────────────────────────────────────────────────────────────

UPDATE public.erp_stock_adjustments
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_store_transfers
SET from_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid,
    to_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE from_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
   OR to_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_transfer_requests
SET from_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid,
    to_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE from_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
   OR to_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.erp_transfer_payments
SET from_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid,
    to_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE from_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
   OR to_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.stock_movements
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

UPDATE public.stock_movements
SET transfer_store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE transfer_store_id IS NOT NULL
  AND transfer_store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

-- Merge per-store stock into STORE-A, then drop other store rows.
INSERT INTO public.store_inventory (
  store_id,
  variant_id,
  stock,
  reserved_stock,
  opening_stock,
  purchase_price,
  sales_price,
  updated_at
)
SELECT
  'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid,
  si.variant_id,
  COALESCE(SUM(si.stock), 0),
  COALESCE(SUM(si.reserved_stock), 0),
  COALESCE(SUM(si.opening_stock), 0),
  MAX(si.purchase_price),
  MAX(si.sales_price),
  now()
FROM public.store_inventory si
WHERE si.store_id <> 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
GROUP BY si.variant_id
ON CONFLICT (store_id, variant_id) DO UPDATE
SET stock = public.store_inventory.stock + EXCLUDED.stock,
    reserved_stock = public.store_inventory.reserved_stock + EXCLUDED.reserved_stock,
    opening_stock = public.store_inventory.opening_stock + EXCLUDED.opening_stock,
    purchase_price = COALESCE(public.store_inventory.purchase_price, EXCLUDED.purchase_price),
    sales_price = COALESCE(public.store_inventory.sales_price, EXCLUDED.sales_price),
    updated_at = now();

DELETE FROM public.store_inventory
WHERE store_id <> 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

-- Seed STORE-A stock from central inventory cache where no per-store row exists yet.
INSERT INTO public.store_inventory (
  store_id,
  variant_id,
  stock,
  reserved_stock,
  opening_stock,
  updated_at
)
SELECT
  'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid,
  i.variant_id,
  COALESCE(i.stock, 0),
  0,
  COALESCE(i.stock, 0),
  now()
FROM public.inventory i
WHERE NOT EXISTS (
  SELECT 1
  FROM public.store_inventory si
  WHERE si.store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
    AND si.variant_id = i.variant_id
)
ON CONFLICT (store_id, variant_id) DO NOTHING;

SELECT public.reconcile_central_inventory_from_stores();

-- ─── Audit trail ────────────────────────────────────────────────────────────

UPDATE public.audit_logs
SET store_id = 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid
WHERE store_id IS DISTINCT FROM 'b406b220-2423-4c4f-9f8a-1cbabd9fbe79'::uuid;

COMMIT;
