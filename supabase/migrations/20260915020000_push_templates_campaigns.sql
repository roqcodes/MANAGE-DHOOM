-- Push templates, campaign scheduling, and automation presets.

BEGIN;

ALTER TABLE public.push_campaigns DROP CONSTRAINT IF EXISTS push_campaigns_status_check;
ALTER TABLE public.push_campaigns
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz,
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'campaign',
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

UPDATE public.push_campaigns SET name = title WHERE name IS NULL;
ALTER TABLE public.push_campaigns ALTER COLUMN name SET DEFAULT '';

ALTER TABLE public.push_campaigns
  ADD CONSTRAINT push_campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'partial', 'failed', 'cancelled'));

ALTER TABLE public.push_campaigns
  DROP CONSTRAINT IF EXISTS push_campaigns_origin_check;
ALTER TABLE public.push_campaigns
  ADD CONSTRAINT push_campaigns_origin_check
  CHECK (origin IN ('campaign', 'automation'));

CREATE TABLE IF NOT EXISTS public.push_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'campaign'
    CHECK (kind IN ('automation', 'campaign')),
  event_key text UNIQUE,
  name text NOT NULL,
  topic text NOT NULL DEFAULT 'promo'
    CHECK (topic IN ('order', 'promo', 'wallet', 'system')),
  title text NOT NULL,
  body text NOT NULL,
  href text,
  sound text NOT NULL DEFAULT 'default',
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_templates_kind ON public.push_templates (kind);
CREATE INDEX IF NOT EXISTS idx_push_campaigns_scheduled
  ON public.push_campaigns (scheduled_at)
  WHERE status = 'scheduled';

ALTER TABLE public.push_campaigns
  DROP CONSTRAINT IF EXISTS push_campaigns_template_id_fkey;
ALTER TABLE public.push_campaigns
  ADD CONSTRAINT push_campaigns_template_id_fkey
  FOREIGN KEY (template_id) REFERENCES public.push_templates (id) ON DELETE SET NULL;

ALTER TABLE public.push_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_templates_read ON public.push_templates;
CREATE POLICY push_templates_read ON public.push_templates
  FOR SELECT USING (true);

DROP POLICY IF EXISTS push_templates_staff_write ON public.push_templates;
CREATE POLICY push_templates_staff_write ON public.push_templates
  FOR ALL USING (public.is_staff_user()) WITH CHECK (public.is_staff_user());

GRANT SELECT ON public.push_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.push_templates TO authenticated;

INSERT INTO public.push_templates (kind, event_key, name, topic, title, body, href, enabled)
VALUES
  ('automation', 'order.placed', 'Order placed', 'order',
   'Order confirmed',
   'Hi {{customer_name}}, we received order {{order_ref}} for {{amount}}.',
   '/orders', true),
  ('automation', 'order.confirmed', 'Order confirmed', 'order',
   'Your order is being packed',
   'Order {{order_ref}} is now being prepared. Total {{amount}}.',
   '/orders', true),
  ('automation', 'order.shipped', 'Order shipped', 'order',
   'Order on the way',
   'Order {{order_ref}} has been shipped. Track it in the app.',
   '/orders', true),
  ('automation', 'order.delivered', 'Order delivered', 'order',
   'Order delivered',
   'Order {{order_ref}} was delivered. Thank you for shopping with BuyHub.',
   '/orders', true),
  ('automation', 'order.cancelled', 'Order cancelled', 'order',
   'Order cancelled',
   'Order {{order_ref}} was cancelled.{{refund_note}}',
   '/orders', true),
  ('automation', 'wallet.topup', 'Wallet top-up', 'wallet',
   'Wallet credited',
   '{{amount}} was added to your BuyHub wallet.',
   '/wallet', true),
  ('automation', 'wallet.credited', 'Wallet credit', 'wallet',
   'Wallet updated',
   '{{amount}} was credited to your wallet. {{reference}}',
   '/wallet', true),
  ('automation', 'wallet.debited', 'Wallet debit', 'wallet',
   'Wallet payment',
   '{{amount}} was paid from your wallet. {{reference}}',
   '/wallet', true)
ON CONFLICT (event_key) DO NOTHING;

COMMIT;
