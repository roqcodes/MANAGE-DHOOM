import "server-only";

import { unstable_cache } from "next/cache";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { PUBLIC_CATALOG_CACHE_TAG } from "@/lib/cache/public-catalog-cache";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

export interface MarketplaceProduct {
  id: string;
  name: string | null;
  description: string | null;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean | null;
  created_at: string | null;
  category?: {
    id: string;
    name: string | null;
    parent_id: string | null;
  } | null;
  min_price: number | null;
  max_price: number | null;
  variants_count: number;
}

export interface MarketplaceProductDetail {
  id: string;
  name: string | null;
  description: string | null;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean | null;
  created_at: string | null;
  category?: {
    id: string;
    name: string | null;
    parent_id: string | null;
  } | null;
  variants: {
    id: string;
    name: string | null;
    price: number | null;
    mrp: number | null;
    stock?: number | null;
  }[];
}

export interface MarketplaceCategory {
  id: string;
  name: string | null;
  parent_id: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  product_count: number;
}

const PAGE_SIZE = 20;

async function loadMarketplaceProductsPage(page: number): Promise<{
  data: MarketplaceProduct[];
  total: number;
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const [dataResult, countResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
        id,
        name,
        description,
        category_id,
        image_url,
        is_active,
        created_at,
        categories!inner(
          id,
          name,
          parent_id
        ),
        product_variants!inner(
          id,
          price,
          mrp
        )
      `,
        { count: "exact" },
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(from, to - 1),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true),
  ]);

  if (dataResult.error) {
    throw new Error(dataResult.error.message);
  }

  const products = (dataResult.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category_id: p.category_id,
    image_url: p.image_url,
    is_active: p.is_active,
    created_at: p.created_at,
    category: p.categories?.[0] || null,
    min_price: Math.min(...(p.product_variants?.map((v: any) => v.price || 0) || [0])),
    max_price: Math.max(...(p.product_variants?.map((v: any) => v.price || 0) || [0])),
    variants_count: p.product_variants?.length || 0,
  })) as MarketplaceProduct[];

  return {
    data: products,
    total: countResult.count || 0,
    hasMore: from + products.length < (countResult.count || 0),
  };
}

/**
 * Get public product catalog (active products only).
 * Cached briefly for read load; checkout/POS never use this for stock authority.
 */
export async function getMarketplaceProducts(page = 0): Promise<{
  data: MarketplaceProduct[];
  total: number;
  hasMore: boolean;
}> {
  const safePage = Math.max(0, Math.floor(page));
  return unstable_cache(
    () => loadMarketplaceProductsPage(safePage),
    ["marketplace-products-page", String(safePage)],
    {
      tags: [PUBLIC_CATALOG_CACHE_TAG],
      revalidate: 60,
    },
  )();
}

/**
 * Get single product detail with variants.
 * No auth required - public endpoint.
 */
export async function getMarketplaceProductById(
  id: string,
): Promise<MarketplaceProductDetail | null> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      description,
      category_id,
      image_url,
      is_active,
      created_at,
      categories!inner(
        id,
        name,
        parent_id
      ),
      product_variants!inner(
        id,
        name,
        price,
        mrp
      ),
      inventory(
        variant_id,
        stock
      )
    `,
    )
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const d = data as any;

  const variants = (d.product_variants || []).map((v: any) => ({
    id: v.id,
    name: v.name,
    price: v.price,
    mrp: v.mrp,
    stock: d.inventory?.find((i: any) => i.variant_id === v.id)?.stock || null,
  }));

  return {
    id: d.id,
    name: d.name,
    description: d.description,
    category_id: d.category_id,
    image_url: d.image_url,
    is_active: d.is_active,
    created_at: d.created_at,
    category: d.categories?.[0] || null,
    variants,
  };
}

async function loadMarketplaceCategoriesFromDb(): Promise<MarketplaceCategory[]> {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("categories")
    .select(
      `
      id,
      name,
      parent_id,
      thumbnail_url,
      image_url,
      products!inner(id)
    `,
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).map((c: any) => ({
    id: c.id,
    name: c.name,
    parent_id: c.parent_id,
    thumbnail_url: c.thumbnail_url,
    image_url: c.image_url,
    product_count: c.products?.length || 0,
  })) as MarketplaceCategory[];
}

/** Category tree for public storefront (revalidated on catalog mutations). */
export async function getMarketplaceCategories(): Promise<MarketplaceCategory[]> {
  return unstable_cache(
    loadMarketplaceCategoriesFromDb,
    ["marketplace-categories"],
    {
      tags: [PUBLIC_CATALOG_CACHE_TAG],
      revalidate: 120,
    },
  )();
}

/**
 * Search products by name or description.
 */
export async function searchMarketplaceProducts(
  query: string,
  page = 0,
): Promise<{
  data: MarketplaceProduct[];
  total: number;
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const searchQuery = `%${query}%`;

  const [dataResult, countResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
        id,
        name,
        description,
        category_id,
        image_url,
        is_active,
        created_at,
        categories!inner(
          id,
          name,
          parent_id
        ),
        product_variants!inner(
          id,
          price,
          mrp
        )
      `,
        { count: "exact" },
      )
      .eq("is_active", true)
      .or(`name.ilike.${searchQuery},description.ilike.${searchQuery}`)
      .order("created_at", { ascending: false })
      .range(from, to - 1),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .or(`name.ilike.${searchQuery},description.ilike.${searchQuery}`),
  ]);

  if (dataResult.error) {
    throw new Error(dataResult.error.message);
  }

  const products = (dataResult.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category_id: p.category_id,
    image_url: p.image_url,
    is_active: p.is_active,
    created_at: p.created_at,
    category: p.categories?.[0] || null,
    min_price: Math.min(...(p.product_variants?.map((v: any) => v.price || 0) || [0])),
    max_price: Math.max(...(p.product_variants?.map((v: any) => v.price || 0) || [0])),
    variants_count: p.product_variants?.length || 0,
  })) as MarketplaceProduct[];

  return {
    data: products,
    total: countResult.count || 0,
    hasMore: from + products.length < (countResult.count || 0),
  };
}

/**
 * Get products by category.
 */
export async function getMarketplaceProductsByCategory(
  categoryId: string,
  page = 0,
): Promise<{
  data: MarketplaceProduct[];
  total: number;
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE;

  const [dataResult, countResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        `
        id,
        name,
        description,
        category_id,
        image_url,
        is_active,
        created_at,
        categories!inner(
          id,
          name,
          parent_id
        ),
        product_variants!inner(
          id,
          price,
          mrp
        )
      `,
        { count: "exact" },
      )
      .eq("is_active", true)
      .eq("category_id", categoryId)
      .order("created_at", { ascending: false })
      .range(from, to - 1),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .eq("category_id", categoryId),
  ]);

  if (dataResult.error) {
    throw new Error(dataResult.error.message);
  }

  const products = (dataResult.data || []).map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    category_id: p.category_id,
    image_url: p.image_url,
    is_active: p.is_active,
    created_at: p.created_at,
    category: p.categories?.[0] || null,
    min_price: Math.min(...(p.product_variants?.map((v: any) => v.price || 0) || [0])),
    max_price: Math.max(...(p.product_variants?.map((v: any) => v.price || 0) || [0])),
    variants_count: p.product_variants?.length || 0,
  })) as MarketplaceProduct[];

  return {
    data: products,
    total: countResult.count || 0,
    hasMore: from + products.length < (countResult.count || 0),
  };
}
