-- Seed: 5 categories + 25 products + variants + inventory
-- IDs are omitted so DB defaults (e.g. gen_random_uuid()) apply.
-- Images: Unsplash (hotlinking ok for dev; replace with your CDN in production).
-- Run once in Supabase SQL editor. If re-running, delete dependent rows first (see bottom).

BEGIN;

WITH cat_rows AS (
  INSERT INTO public.categories (name, parent_id, image_url)
  VALUES
    (
      'Audio & sound',
      NULL,
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Computing',
      NULL,
      'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Mobile & accessories',
      NULL,
      'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'TV & displays',
      NULL,
      'https://images.unsplash.com/photo-1593784997031-6c7514e398f3?auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Components & cables',
      NULL,
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1200&q=80'
    )
  RETURNING id, name
),
prod_rows AS (
  INSERT INTO public.products (name, description, category_id, image_url, is_active)
  SELECT
    x.name,
    x.description,
    c.id,
    x.image_url,
    true
  FROM (
    VALUES
      (
        'Bluetooth speaker 20W',
        'Portable wireless speaker, IPX5.',
        'Audio & sound',
        'https://images.unsplash.com/photo-1608043152269-423dbba4e7e2?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Wired over-ear headset',
        'Closed-back monitoring headset.',
        'Audio & sound',
        'https://images.unsplash.com/photo-1484704849700-f032a568e944?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'USB condenser microphone',
        'Cardioid USB mic for calls and streaming.',
        'Audio & sound',
        'https://images.unsplash.com/photo-1590602847861-f357a9332a0a?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Compact soundbar 2.1',
        'Soundbar with wireless subwoofer.',
        'Audio & sound',
        'https://images.unsplash.com/photo-1545454675-3531b5437d5d?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'True wireless earbuds',
        'ANC earbuds with charging case.',
        'Audio & sound',
        'https://images.unsplash.com/photo-1590658268037-6bf12165aed8?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Wireless optical mouse',
        'Ergonomic 2.4 GHz mouse.',
        'Computing',
        'https://images.unsplash.com/photo-1527814050-7d0271e4a238?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Mechanical keyboard TKL',
        'Hot-swap TKL with RGB.',
        'Computing',
        'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'USB-C hub 7-in-1',
        'HDMI, USB-A, SD, power delivery.',
        'Computing',
        'https://images.unsplash.com/photo-1625948515311-4cec97f2a0c0?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Aluminum laptop stand',
        'Adjustable ventilated stand.',
        'Computing',
        'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'External SSD 1TB',
        'USB 3.2 portable solid-state drive.',
        'Computing',
        'https://images.unsplash.com/photo-1597872200969-2b65751c9488?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Tempered glass screen protector',
        'Retail pack universal sizes.',
        'Mobile & accessories',
        'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'USB-C fast charger 25W',
        'PD wall charger with cable.',
        'Mobile & accessories',
        'https://images.unsplash.com/photo-1583864388072-42c6a7d2f43d?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Shockproof phone case',
        'Clear bumper case bulk.',
        'Mobile & accessories',
        'https://images.unsplash.com/photo-1556656793-08538906a9f8?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Power bank 20000mAh',
        'Dual USB-A + USB-C output.',
        'Mobile & accessories',
        'https://images.unsplash.com/photo-1609091839316-d2471edf8e41?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Magnetic car phone mount',
        'Vent and dash compatible.',
        'Mobile & accessories',
        'https://images.unsplash.com/photo-1449965408869-eaa3f752e8c2?auto=format&fit=crop&w=800&q=80'
      ),
      (
        '32-inch FHD LED TV',
        'Entry smart-ready FHD panel.',
        'TV & displays',
        'https://images.unsplash.com/photo-1461158534-2118e4bd6018?auto=format&fit=crop&w=800&q=80'
      ),
      (
        '43-inch UHD TV',
        '4K HDR retail display.',
        'TV & displays',
        'https://images.unsplash.com/photo-1593359677877-a4bb92f829d1?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'HDMI cable 2m 2.1',
        'High-speed certified HDMI.',
        'TV & displays',
        'https://images.unsplash.com/photo-1587825147138-346393b5f9f9?auto=format&fit=crop&w=800&q=80'
      ),
      (
        '4K streaming stick',
        'HDMI streaming device.',
        'TV & displays',
        'https://images.unsplash.com/photo-1578662996442-48f60103fc96?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Fixed TV wall bracket',
        'VESA 200×200 mount.',
        'TV & displays',
        'https://images.unsplash.com/photo-1522869635100-9f4c7e709aa6?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'CAT6 patch cable 3m',
        'RJ45 snagless blue.',
        'Components & cables',
        'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Surge protector 6-outlet',
        'Master switch with indicator.',
        'Components & cables',
        'https://images.unsplash.com/photo-1625841070413-080d8d1e8c5d?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Gigabit switch 8-port',
        'Unmanaged desktop switch.',
        'Components & cables',
        'https://images.unsplash.com/photo-1558494949-010a311d3f23?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'CR2032 battery tray 10pc',
        'Lithium coin cells retail box.',
        'Components & cables',
        'https://images.unsplash.com/photo-1589827168284-922f4c3e2ee0?auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Cable ties & velcro set',
        'Assorted reusable ties.',
        'Components & cables',
        'https://images.unsplash.com/photo-1517438476312-6d71537e3c00?auto=format&fit=crop&w=800&q=80'
      )
  ) AS x(name, description, cat_name, image_url)
  JOIN cat_rows c ON c.name = x.cat_name
  RETURNING id, name
)
INSERT INTO public.product_variants (product_id, name, price, mrp)
SELECT
  p.id,
  'Default',
  v.price,
  v.mrp
FROM (
  VALUES
    ('Bluetooth speaker 20W', 2499, 3299),
    ('Wired over-ear headset', 1899, 2499),
    ('USB condenser microphone', 3499, 4499),
    ('Compact soundbar 2.1', 8999, 11999),
    ('True wireless earbuds', 4999, 6999),
    ('Wireless optical mouse', 799, 1199),
    ('Mechanical keyboard TKL', 5999, 7999),
    ('USB-C hub 7-in-1', 2799, 3499),
    ('Aluminum laptop stand', 1299, 1799),
    ('External SSD 1TB', 6499, 7999),
    ('Tempered glass screen protector', 299, 499),
    ('USB-C fast charger 25W', 899, 1299),
    ('Shockproof phone case', 399, 599),
    ('Power bank 20000mAh', 1999, 2799),
    ('Magnetic car phone mount', 499, 799),
    ('32-inch FHD LED TV', 12499, 14999),
    ('43-inch UHD TV', 26999, 31999),
    ('HDMI cable 2m 2.1', 599, 899),
    ('4K streaming stick', 3999, 4999),
    ('Fixed TV wall bracket', 899, 1299),
    ('CAT6 patch cable 3m', 199, 299),
    ('Surge protector 6-outlet', 799, 1199),
    ('Gigabit switch 8-port', 2499, 3299),
    ('CR2032 battery tray 10pc', 149, 249),
    ('Cable ties & velcro set', 349, 499)
) AS v(pname, price, mrp)
JOIN prod_rows p ON p.name = v.pname;

-- If `inventory` has no UNIQUE on `variant_id`, drop the ON CONFLICT line below.
INSERT INTO public.inventory (variant_id, stock)
SELECT
  pv.id,
  s.qty
FROM (
  VALUES
    ('Bluetooth speaker 20W', 48),
    ('Wired over-ear headset', 120),
    ('USB condenser microphone', 36),
    ('Compact soundbar 2.1', 12),
    ('True wireless earbuds', 84),
    ('Wireless optical mouse', 200),
    ('Mechanical keyboard TKL', 24),
    ('USB-C hub 7-in-1', 60),
    ('Aluminum laptop stand', 90),
    ('External SSD 1TB', 18),
    ('Tempered glass screen protector', 300),
    ('USB-C fast charger 25W', 150),
    ('Shockproof phone case', 220),
    ('Power bank 20000mAh', 55),
    ('Magnetic car phone mount', 175),
    ('32-inch FHD LED TV', 8),
    ('43-inch UHD TV', 6),
    ('HDMI cable 2m 2.1', 400),
    ('4K streaming stick', 40),
    ('Fixed TV wall bracket', 65),
    ('CAT6 patch cable 3m', 500),
    ('Surge protector 6-outlet', 72),
    ('Gigabit switch 8-port', 30),
    ('CR2032 battery tray 10pc', 600),
    ('Cable ties & velcro set', 140)
) AS s(pname, qty)
JOIN public.products pr ON pr.name = s.pname
JOIN public.product_variants pv ON pv.product_id = pr.id AND pv.name = 'Default'
ON CONFLICT (variant_id) DO UPDATE SET stock = EXCLUDED.stock;

COMMIT;

-- Optional: wipe this seed if names collide (adjust if you changed titles)
-- DELETE FROM public.inventory WHERE variant_id IN (
--   SELECT pv.id FROM public.product_variants pv
--   JOIN public.products p ON p.id = pv.product_id
--   WHERE p.name LIKE '%Bluetooth speaker%' OR p.name IN (SELECT name FROM ...));
-- Safer: truncate in FK order in a dev DB only.
