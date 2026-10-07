-- Batch 2: 5 NEW categories + 25 NEW products (names distinct from seed-25-products.sql)
-- IDs omitted (DB defaults).
-- Images: 30 unique Unsplash URLs (5 category heroes + 25 product shots). Uses ixlib=rb-4.0.3 + auto=format&fit=crop (CDN-friendly).
-- Run after batch 1, or standalone if these category/product names do not already exist.

BEGIN;

WITH cat_rows AS (
  INSERT INTO public.categories (name, parent_id, image_url)
  VALUES
    (
      'Smart home & IoT',
      NULL,
      'https://images.unsplash.com/photo-1558002038-1055907df827?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'PC cooling & internals',
      NULL,
      'https://images.unsplash.com/photo-1591488320449-011701bb6704?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Photography & studio',
      NULL,
      'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Wearables & health tech',
      NULL,
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'
    ),
    (
      'Gaming & desk setup',
      NULL,
      'https://images.unsplash.com/photo-1612287230202-1ff1d85d1bdf?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80'
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
        'Outdoor bullet IP camera 3MP',
        'PoE-ready weatherproof bullet cam with night vision.',
        'Smart home & IoT',
        'https://images.unsplash.com/photo-1557324232-0c075ca7cbd9?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Wi-Fi smart plug 16A',
        'App scheduling and energy monitoring.',
        'Smart home & IoT',
        'https://images.unsplash.com/photo-1560174030-a0a805eb4bbd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Zigbee motion sensor PIR',
        'Battery-powered motion detector for automation.',
        'Smart home & IoT',
        'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'RGB LED strip kit 5m',
        'Wi-Fi controller and power supply included.',
        'Smart home & IoT',
        'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Smart smoke & CO listener',
        'Audio alert relay for existing detectors.',
        'Smart home & IoT',
        'https://images.unsplash.com/photo-1585202448527-9c7a4c0c63c1?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'AIO CPU liquid cooler 240mm',
        'Dual 120mm PWM fans, Intel/AMD brackets.',
        'PC cooling & internals',
        'https://images.unsplash.com/photo-1587202372634-3a7c6c6a2c33?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Thermal compound syringe 5g',
        'High-conductivity paste for CPUs and GPUs.',
        'PC cooling & internals',
        'https://images.unsplash.com/photo-1550009158-9dc8acd34f23?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'PWM fan hub 1-to-6 SATA powered',
        'Sleeving and adhesive mount included.',
        'PC cooling & internals',
        'https://images.unsplash.com/photo-1518770660439-4636190af475?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'M.2 SSD heatsink single slot',
        'Aluminum spreader with thermal pads.',
        'PC cooling & internals',
        'https://images.unsplash.com/photo-1531297484001-800221027f7e?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'PCIe riser cable gen4 x16',
        'Vertical GPU mount friendly, shielded ribbon.',
        'PC cooling & internals',
        'https://images.unsplash.com/photo-1498050108023-c5249f4df085?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Bi-color LED panel 12 inch',
        'Dimmable CCT for streaming and product shots.',
        'Photography & studio',
        'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Carbon fiber tripod 1.6m',
        'Ball head and quick-release plate.',
        'Photography & studio',
        'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'SDXC card 256GB V30',
        'UHS-I U3 for 4K capture.',
        'Photography & studio',
        'https://images.unsplash.com/photo-1606761568493-ef25c468d7bc?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Lens cleaning pen & blower kit',
        'Carbon tip and anti-static brush.',
        'Photography & studio',
        'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Shotgun mic compact for mirrorless',
        'Shock mount and furry windscreen.',
        'Photography & studio',
        'https://images.unsplash.com/photo-1473968510967-0f4bb2e0b5e8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Silicone sport band 22mm 3-pack',
        'Quick-release pins; mixed colors.',
        'Wearables & health tech',
        'https://images.unsplash.com/photo-1434493789847-2f02dc6ca35d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Smartwatch charging puck USB-A',
        'Magnetic dock for popular 44–46mm watches.',
        'Wearables & health tech',
        'https://images.unsplash.com/photo-1579586337278-3befd40fd17a?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Tempered glass watch face 47mm',
        'Oleophobic 2-pack retail.',
        'Wearables & health tech',
        'https://images.unsplash.com/photo-1572635196237-14b3f281503f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Chest heart-rate strap Bluetooth',
        'ANT+ and BLE dual mode.',
        'Wearables & health tech',
        'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Portable ECG monitor single-lead',
        'App-connected wellness snapshot device.',
        'Wearables & health tech',
        'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Wireless gaming controller PC',
        'Bluetooth and 2.4 GHz dongle included.',
        'Gaming & desk setup',
        'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Desk mouse pad XXL stitched',
        '900×400 mm cloth surface.',
        'Gaming & desk setup',
        'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Headphone stand aluminum',
        'Weighted base with cable route.',
        'Gaming & desk setup',
        'https://images.unsplash.com/photo-1485827401513-434b3835a4f8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Boom arm mic desk clamp',
        '3/8 and 5/8 adapters included.',
        'Gaming & desk setup',
        'https://images.unsplash.com/photo-1526173818868-22931e8b3c0b?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
      ),
      (
        'Controller thumb grip caps 10-pack',
        'Silicone mixed height for console pads.',
        'Gaming & desk setup',
        'https://images.unsplash.com/photo-1583521215177-6bfc888ae9a8?ixlib=rb-4.0.3&auto=format&fit=crop&w=800&q=80'
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
    ('Outdoor bullet IP camera 3MP', 4599, 5999),
    ('Wi-Fi smart plug 16A', 1299, 1799),
    ('Zigbee motion sensor PIR', 899, 1299),
    ('RGB LED strip kit 5m', 2199, 2999),
    ('Smart smoke & CO listener', 3499, 4499),
    ('AIO CPU liquid cooler 240mm', 7499, 9499),
    ('Thermal compound syringe 5g', 399, 599),
    ('PWM fan hub 1-to-6 SATA powered', 799, 1199),
    ('M.2 SSD heatsink single slot', 499, 799),
    ('PCIe riser cable gen4 x16', 3299, 4299),
    ('Bi-color LED panel 12 inch', 5999, 7999),
    ('Carbon fiber tripod 1.6m', 8999, 11999),
    ('SDXC card 256GB V30', 2499, 3299),
    ('Lens cleaning pen & blower kit', 599, 899),
    ('Shotgun mic compact for mirrorless', 6999, 8999),
    ('Silicone sport band 22mm 3-pack', 799, 1199),
    ('Smartwatch charging puck USB-A', 999, 1499),
    ('Tempered glass watch face 47mm', 399, 599),
    ('Chest heart-rate strap Bluetooth', 4499, 5999),
    ('Portable ECG monitor single-lead', 7999, 9999),
    ('Wireless gaming controller PC', 3999, 4999),
    ('Desk mouse pad XXL stitched', 1299, 1799),
    ('Headphone stand aluminum', 1499, 1999),
    ('Boom arm mic desk clamp', 2999, 3999),
    ('Controller thumb grip caps 10-pack', 299, 499)
) AS v(pname, price, mrp)
JOIN prod_rows p ON p.name = v.pname;

INSERT INTO public.inventory (variant_id, stock)
SELECT
  pv.id,
  s.qty
FROM (
  VALUES
    ('Outdoor bullet IP camera 3MP', 22),
    ('Wi-Fi smart plug 16A', 80),
    ('Zigbee motion sensor PIR', 110),
    ('RGB LED strip kit 5m', 45),
    ('Smart smoke & CO listener', 18),
    ('AIO CPU liquid cooler 240mm', 14),
    ('Thermal compound syringe 5g', 240),
    ('PWM fan hub 1-to-6 SATA powered', 55),
    ('M.2 SSD heatsink single slot', 95),
    ('PCIe riser cable gen4 x16', 28),
    ('Bi-color LED panel 12 inch', 10),
    ('Carbon fiber tripod 1.6m', 8),
    ('SDXC card 256GB V30', 60),
    ('Lens cleaning pen & blower kit', 150),
    ('Shotgun mic compact for mirrorless', 12),
    ('Silicone sport band 22mm 3-pack', 200),
    ('Smartwatch charging puck USB-A', 130),
    ('Tempered glass watch face 47mm', 180),
    ('Chest heart-rate strap Bluetooth', 25),
    ('Portable ECG monitor single-lead', 6),
    ('Wireless gaming controller PC', 35),
    ('Desk mouse pad XXL stitched', 70),
    ('Headphone stand aluminum', 50),
    ('Boom arm mic desk clamp', 20),
    ('Controller thumb grip caps 10-pack', 400)
) AS s(pname, qty)
JOIN public.products pr ON pr.name = s.pname
JOIN public.product_variants pv ON pv.product_id = pr.id AND pv.name = 'Default'
ON CONFLICT (variant_id) DO UPDATE SET stock = EXCLUDED.stock;

COMMIT;
