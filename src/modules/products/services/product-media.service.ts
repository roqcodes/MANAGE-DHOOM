import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

function orderedUrls(urls: string[], previewIndex: number): string[] {
  if (previewIndex > 0 && previewIndex < urls.length) {
    return [urls[previewIndex], ...urls.filter((_, i) => i !== previewIndex)];
  }
  return urls;
}

export async function listProductImages(productId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_images")
    .select("url,is_preview,sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listProductVideos(productId: string) {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("product_videos")
    .select("url,sort_order")
    .eq("product_id", productId)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function syncProductImages(
  productId: string,
  urls: string[],
  previewIndex = 0,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const cleanUrls = orderedUrls(
    urls.map((u) => u.trim()).filter(Boolean),
    previewIndex,
  );
  const supabase = await createSupabaseServerClient();

  const { error: delErr } = await supabase
    .from("product_images")
    .delete()
    .eq("product_id", productId);
  if (delErr) throw new Error(delErr.message);

  if (cleanUrls.length === 0) return;

  const rows = cleanUrls.map((url, i) => ({
    product_id: productId,
    url,
    sort_order: i,
    is_preview: i === 0,
  }));

  const { error } = await supabase.from("product_images").insert(rows);
  if (error) throw new Error(error.message);
}

export async function syncProductVideos(
  productId: string,
  urls: string[],
): Promise<void> {
  await requireAdminOrManagerProfile();
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  const supabase = await createSupabaseServerClient();

  const { error: delErr } = await supabase
    .from("product_videos")
    .delete()
    .eq("product_id", productId);
  if (delErr) throw new Error(delErr.message);

  if (cleanUrls.length === 0) return;

  const rows = cleanUrls.map((url, i) => ({
    product_id: productId,
    url,
    sort_order: i,
  }));

  const { error } = await supabase.from("product_videos").insert(rows);
  if (error) throw new Error(error.message);
}

export async function addProductImages(
  productId: string,
  urls: string[],
): Promise<void> {
  await requireAdminOrManagerProfile();
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  if (cleanUrls.length === 0) return;

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingErr } = await supabase
    .from("product_images")
    .select("id,is_preview,sort_order")
    .eq("product_id", productId);
  if (existingErr) throw new Error(existingErr.message);

  const hasPreview = (existing ?? []).some((r) => r.is_preview);
  const nextSortBase =
    (existing ?? []).reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 1;

  const rows = cleanUrls.map((url, i) => ({
    product_id: productId,
    url,
    sort_order: nextSortBase + i,
    is_preview: !hasPreview && i === 0,
  }));

  const { error } = await supabase.from("product_images").insert(rows);
  if (error) throw new Error(error.message);
}

export async function addProductVideos(
  productId: string,
  urls: string[],
): Promise<void> {
  await requireAdminOrManagerProfile();
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  if (cleanUrls.length === 0) return;

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingErr } = await supabase
    .from("product_videos")
    .select("sort_order")
    .eq("product_id", productId);
  if (existingErr) throw new Error(existingErr.message);

  const nextSortBase =
    (existing ?? []).reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 1;

  const rows = cleanUrls.map((url, i) => ({
    product_id: productId,
    url,
    sort_order: nextSortBase + i,
  }));

  const { error } = await supabase.from("product_videos").insert(rows);
  if (error) throw new Error(error.message);
}
