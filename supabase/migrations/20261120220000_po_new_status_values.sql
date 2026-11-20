-- Migration: extend purchase_orders with new lifecycle status values.
--
-- The purchase_orders.status column is TEXT (no PG enum), so we just need to
-- drop any CHECK constraint that restricts the allowed values and document the
-- new valid set.  Any downstream filter that excludes terminal statuses already
-- works because it uses NOT IN / IN logic.
--
-- New statuses added:
--   production  – PO saved / in-production at vendor, not yet shipped
--   by_sea      – shipment dispatched by sea
--   by_air      – shipment dispatched by air
--   in_customs  – shipment held in customs / clearing
--   received    – goods physically received in warehouse; awaiting invoice
--
-- Existing statuses kept intact:
--   pending, accepted, delivered, cancelled, partially_received,
--   fully_received, closed

BEGIN;

-- Drop the status CHECK constraint on purchase_orders if one exists.
-- (In practice the column was added with no constraint by phase3 migration, but
--  this is defensive so it is safe to run regardless.)
DO $$
DECLARE
  v_constraint_name text;
BEGIN
  SELECT conname
    INTO v_constraint_name
    FROM pg_constraint
   WHERE conrelid = 'public.purchase_orders'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%'
   LIMIT 1;

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END IF;
END;
$$;

-- Ensure the status column exists and has the right default.
-- (New purchase orders start in 'production' status)
ALTER TABLE public.purchase_orders
  ALTER COLUMN status SET DEFAULT 'production';

-- Add an optional expected_delivery_date column if not already present
-- (also added by phase3, but guarded for safety).
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS expected_delivery_date date;

-- Add transit_mode to record how the shipment travels (informational).
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS transit_mode text
    CHECK (transit_mode IN ('by_sea', 'by_air', 'in_customs') OR transit_mode IS NULL);

-- ── Data Migration for Existing Records ──────────────────────────────────────────
-- Migrate existing purchase orders so they match the new lifecycle:
-- 1) Any open POs currently in 'pending' or 'accepted' move to 'production'
--    so they get the "Ready For Pickup" action button.
UPDATE public.purchase_orders
   SET status = 'production',
       updated_at = now()
 WHERE status IN ('pending', 'accepted');

-- 2) Any POs currently marked 'delivered' (vendor signaled delivery, but goods
--    or bills were never finalized) move to 'received' so the user can immediately
--    generate and finalize invoice.
UPDATE public.purchase_orders
   SET status = 'received',
       updated_at = now()
 WHERE status = 'delivered'
   AND id NOT IN (
     SELECT DISTINCT po_id
       FROM public.erp_purchase_receives
      WHERE po_id IS NOT NULL
        AND status = 'finalized'
   );

COMMIT;
