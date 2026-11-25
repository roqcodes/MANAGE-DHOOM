-- Manual verification after applying 20261125150000 + 20261125160000.
-- Run in SQL editor as staff; replace placeholders.

-- 1) Movement type allows opening
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.stock_movements'::regclass AND conname = 'stock_movements_type_check';

-- 2) Posting rules
-- SELECT event_type, is_enabled FROM erp_posting_rules
-- WHERE event_type IN ('opening_stock', 'stock_adjustment');

-- 3) After finalize opening (store S, product P, qty 10, cost 20):
-- SELECT stock, purchase_price, opening_stock FROM store_product_inventory WHERE store_id = :store AND product_id = :product;
-- Expected: stock 10, purchase_price 20, opening_stock 10

-- 4) Second opening same product/store should ERROR on finalize.

-- 5) Adjustment add 5 @ 30 after opening: WAC = (10*20 + 5*30)/15 = 23.3333