-- KitchenGrid category seed with thumbnails
-- Run AFTER 20260807000000_categories_dynamic.sql
-- Safe to re-run: uses ON CONFLICT on slug

BEGIN;

-- ─── Top-level categories ────────────────────────────────────────────────────
INSERT INTO public.categories (name, slug, parent_id, thumbnail_url, image_url, sort_order, is_active, description)
VALUES
  (
    'Kitchen Appliances',
    'kitchen-appliances',
    NULL,
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?auto=format&fit=crop&w=1200&q=80',
    1, true,
    'Cookware, small appliances, and kitchen tools'
  ),
  (
    'Grocery & Staples',
    'grocery-staples',
    NULL,
    'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80',
    2, true,
    'Rice, pulses, spices, oils, and daily essentials'
  ),
  (
    'Storage & Organization',
    'storage-organization',
    NULL,
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80',
    3, true,
    'Containers, racks, and pantry organizers'
  ),
  (
    'Dining & Serveware',
    'dining-serveware',
    NULL,
    'https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1603199506016-b9a594b593c0?auto=format&fit=crop&w=1200&q=80',
    4, true,
    'Plates, glasses, cutlery, and tableware'
  ),
  (
    'Cleaning Supplies',
    'cleaning-supplies',
    NULL,
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=400&q=80',
    'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1200&q=80',
    5, true,
    'Dish soap, sponges, and kitchen cleaners'
  )
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  thumbnail_url = EXCLUDED.thumbnail_url,
  image_url     = EXCLUDED.image_url,
  sort_order    = EXCLUDED.sort_order,
  is_active     = EXCLUDED.is_active,
  description   = EXCLUDED.description;

-- ─── Subcategories ─────────────────────────────────────────────────────────────
INSERT INTO public.categories (name, slug, parent_id, thumbnail_url, sort_order, is_active)
SELECT
  sub.name,
  sub.slug,
  parent.id,
  sub.thumbnail_url,
  sub.sort_order,
  true
FROM (VALUES
  -- Kitchen Appliances children
  ('Cookware',           'cookware',           'kitchen-appliances',    'https://images.unsplash.com/photo-1584990345689-1c13e3a2a8a0?auto=format&fit=crop&w=400&q=80', 1),
  ('Small Appliances', 'small-appliances',   'kitchen-appliances',    'https://images.unsplash.com/photo-1570222094114-d054a817e56b?auto=format&fit=crop&w=400&q=80', 2),
  ('Cutlery & Knives', 'cutlery-knives',     'kitchen-appliances',    'https://images.unsplash.com/photo-1593618998160-e34014e67546?auto=format&fit=crop&w=400&q=80', 3),
  -- Grocery children
  ('Spices & Masalas', 'spices-masalas',     'grocery-staples',       'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?auto=format&fit=crop&w=400&q=80', 1),
  ('Rice & Pulses',    'rice-pulses',        'grocery-staples',       'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=400&q=80', 2),
  ('Oils & Ghee',      'oils-ghee',          'grocery-staples',       'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=400&q=80', 3),
  -- Storage children
  ('Food Containers',  'food-containers',    'storage-organization',  'https://images.unsplash.com/photo-1615485290381-441d3f5b5d3e?auto=format&fit=crop&w=400&q=80', 1),
  ('Racks & Shelves',  'racks-shelves',      'storage-organization',  'https://images.unsplash.com/photo-1556909212-d5b604d0ff90?auto=format&fit=crop&w=400&q=80', 2),
  -- Dining children
  ('Plates & Bowls',   'plates-bowls',       'dining-serveware',      'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=400&q=80', 1),
  ('Glasses & Mugs',   'glasses-mugs',       'dining-serveware',      'https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=400&q=80', 2)
) AS sub(name, slug, parent_slug, thumbnail_url, sort_order)
JOIN public.categories parent ON parent.slug = sub.parent_slug
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  parent_id     = EXCLUDED.parent_id,
  thumbnail_url = EXCLUDED.thumbnail_url,
  sort_order    = EXCLUDED.sort_order;

COMMIT;
