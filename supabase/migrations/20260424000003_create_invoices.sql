-- Invoices table for B2B wholesale marketplace
-- Run in Supabase SQL Editor or as migration

BEGIN;

-- Invoices table (one per order, generated on order completion)
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_number text NOT NULL UNIQUE,
  gst_number text,
  subtotal numeric NOT NULL DEFAULT 0,
  gst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'paid', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  due_date timestamptz,
  pdf_url text,
  issued_at timestamptz
);

CREATE INDEX idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX idx_invoices_user_id ON public.invoices(user_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_invoice_number ON public.invoices(invoice_number);

-- Invoice items table (snapshot of order items at invoice time)
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  variant_id uuid,
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  base_price numeric NOT NULL DEFAULT 0,
  gst_rate numeric NOT NULL DEFAULT 18,
  gst_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  vendor_id uuid
);

CREATE INDEX idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);

-- Function: Generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date_part text;
  v_seq_num text;
BEGIN
  v_date_part := to_char(now(), 'YYYYMMDD');

  SELECT LPAD(CAST(COUNT(*) + 1 AS text), 4, '0') INTO v_seq_num
  FROM public.invoices
  WHERE invoice_number LIKE 'INV-' || v_date_part || '%';

  RETURN 'INV-' || v_date_part || '-' || v_seq_num;
END;
$$;

-- Function: Generate invoice for order
CREATE OR REPLACE FUNCTION public.generate_invoice_for_order(p_order_id uuid, p_gst_number text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_invoice_id uuid;
  v_invoice_number text;
  v_subtotal numeric := 0;
  v_gst_total numeric := 0;
  v_total numeric := 0;
  v_item RECORD;
  v_gst_rate numeric := 18; -- Default 18% GST
BEGIN
  -- Check if invoice already exists
  SELECT id INTO v_invoice_id FROM public.invoices WHERE order_id = p_order_id;
  IF v_invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice already exists for this order';
  END IF;

  -- Get order details
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF v_order IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Generate invoice number
  v_invoice_number := public.generate_invoice_number();

  -- Create invoice header
  INSERT INTO public.invoices (
    order_id, user_id, invoice_number, gst_number,
    subtotal, gst_amount, total_amount, status,
    created_at, due_date
  ) VALUES (
    p_order_id, v_order.user_id, v_invoice_number, p_gst_number,
    0, 0, 0, 'issued',
    now(), now() + interval '30 days'
  ) RETURNING id INTO v_invoice_id;

  -- Create invoice items from order items
  FOR v_item IN
    SELECT * FROM public.order_items WHERE order_id = p_order_id
  LOOP
    -- Calculate GST per item (simplified: 18% on final_price)
    v_gst_rate := 18;
    v_item.base_price := v_item.final_price;
    v_item.gst_amount := (v_item.final_price * v_gst_rate / 100) * v_item.quantity;
    v_item.total_amount := v_item.final_price * v_item.quantity + v_item.gst_amount;

    INSERT INTO public.invoice_items (
      invoice_id, variant_id, product_name, quantity,
      unit_price, base_price, gst_rate, gst_amount, total_amount, vendor_id
    ) VALUES (
      v_invoice_id, v_item.variant_id, v_item.product_name, v_item.quantity,
      v_item.price, v_item.base_price, v_gst_rate, v_item.gst_amount, v_item.total_amount, v_item.vendor_id
    );

    v_subtotal := v_subtotal + (v_item.final_price * v_item.quantity);
    v_gst_total := v_gst_total + v_item.gst_amount;
    v_total := v_total + v_item.total_amount;
  END LOOP;

  -- Update invoice totals
  UPDATE public.invoices
  SET
    subtotal = v_subtotal,
    gst_amount = v_gst_total,
    total_amount = v_total,
    issued_at = now()
  WHERE id = v_invoice_id;

  -- Return invoice with items
  RETURN (
    SELECT json_build_object(
      'id', i.id,
      'order_id', i.order_id,
      'user_id', i.user_id,
      'invoice_number', i.invoice_number,
      'gst_number', i.gst_number,
      'subtotal', i.subtotal,
      'gst_amount', i.gst_amount,
      'total_amount', i.total_amount,
      'status', i.status,
      'created_at', i.created_at,
      'due_date', i.due_date,
      'issued_at', i.issued_at,
      'items', (
        SELECT COALESCE(
          json_agg(json_build_object(
            'id', ii.id,
            'variant_id', ii.variant_id,
            'product_name', ii.product_name,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'base_price', ii.base_price,
            'gst_rate', ii.gst_rate,
            'gst_amount', ii.gst_amount,
            'total_amount', ii.total_amount
          )),
          '[]'::json
        )
        FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
      )
    )
    FROM public.invoices i
    WHERE i.id = v_invoice_id
  );
END;
$$;

-- Function: Get invoice by ID
CREATE OR REPLACE FUNCTION public.get_invoice_by_id(p_invoice_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'id', i.id,
      'order_id', i.order_id,
      'user_id', i.user_id,
      'invoice_number', i.invoice_number,
      'gst_number', i.gst_number,
      'subtotal', i.subtotal,
      'gst_amount', i.gst_amount,
      'total_amount', i.total_amount,
      'status', i.status,
      'created_at', i.created_at,
      'due_date', i.due_date,
      'issued_at', i.issued_at,
      'pdf_url', i.pdf_url,
      'items', (
        SELECT COALESCE(
          json_agg(json_build_object(
            'id', ii.id,
            'variant_id', ii.variant_id,
            'product_name', ii.product_name,
            'quantity', ii.quantity,
            'unit_price', ii.unit_price,
            'base_price', ii.base_price,
            'gst_rate', ii.gst_rate,
            'gst_amount', ii.gst_amount,
            'total_amount', ii.total_amount
          )),
          '[]'::json
        )
        FROM public.invoice_items ii
        WHERE ii.invoice_id = i.id
      )
    )
    FROM public.invoices i
    WHERE i.id = p_invoice_id AND i.user_id = p_user_id
  );
END;
$$;

-- Function: Get invoices for user
CREATE OR REPLACE FUNCTION public.get_invoices_for_user(
  p_user_id uuid,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', i.id,
          'order_id', i.order_id,
          'invoice_number', i.invoice_number,
          'subtotal', i.subtotal,
          'gst_amount', i.gst_amount,
          'total_amount', i.total_amount,
          'status', i.status,
          'created_at', i.created_at,
          'due_date', i.due_date,
          'issued_at', i.issued_at
        ) ORDER BY i.created_at DESC
      )
      FROM public.invoices i
      WHERE i.user_id = p_user_id
      LIMIT p_limit OFFSET p_offset
    ),
    '[]'::json
  );
END;
$$;

-- Function: Get invoice count for user
CREATE OR REPLACE FUNCTION public.get_invoices_count(p_user_id uuid)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.invoices WHERE user_id = p_user_id;
  RETURN v_count;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_invoice_number() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_invoice_for_order(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoice_by_id(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoices_for_user(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_invoices_count(uuid) TO authenticated;

-- Row Level Security
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- RLS: Users can only see their own invoices
CREATE POLICY "Users can view own invoices"
  ON public.invoices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own invoices"
  ON public.invoices FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS: Users can only see items in their own invoices
CREATE POLICY "Users can view own invoice items"
  ON public.invoice_items FOR SELECT
  USING (
    invoice_id IN (
      SELECT id FROM public.invoices WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own invoice items"
  ON public.invoice_items FOR INSERT
  WITH CHECK (
    invoice_id IN (
      SELECT id FROM public.invoices WHERE user_id = auth.uid()
    )
  );

COMMIT;
