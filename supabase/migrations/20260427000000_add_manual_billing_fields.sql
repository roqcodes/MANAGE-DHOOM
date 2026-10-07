-- Add fields to support manual invoicing for external/offline customers
BEGIN;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_name text,
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS company text,
ADD COLUMN IF NOT EXISTS gst_number text,
ADD COLUMN IF NOT EXISTS source text DEFAULT 'online',
ADD COLUMN IF NOT EXISTS subtotal numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS created_by_admin_id uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.orders.source IS 'Source of the order: "online" (default) or "manual" (created via admin billing)';

COMMIT;
