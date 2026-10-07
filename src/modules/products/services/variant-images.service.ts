import "server-only";

import { requireAdminOrManagerProfile } from "@/modules/admin/services/rbac.service";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";
import type { VariantImage } from "@/common/admin/types";

const IMAGE_COLUMNS = "id,variant_id,url,is_preview,sort_order,created_at";

/**
 * Appends one or more images to a variant. The first image ever added to a
 * variant (i.e. when none has a preview yet) automatically becomes the preview.
 */
export async function addVariantImages(
  variantId: string,
  urls: string[],
): Promise<void> {
  await requireAdminOrManagerProfile();
  const cleanUrls = urls.map((u) => u.trim()).filter(Boolean);
  if (cleanUrls.length === 0) return;

  const supabase = await createSupabaseServerClient();

  const { data: existing, error: existingErr } = await supabase
    .from("variant_images")
    .select("id,is_preview,sort_order")
    .eq("variant_id", variantId);
  if (existingErr) throw new Error(existingErr.message);

  const hasPreview = (existing ?? []).some((r) => r.is_preview);
  const nextSortBase =
    (existing ?? []).reduce((max, r) => Math.max(max, r.sort_order ?? 0), 0) + 1;

  const rows = cleanUrls.map((url, i) => ({
    variant_id: variantId,
    url,
    sort_order: nextSortBase + i,
    is_preview: !hasPreview && i === 0,
  }));

  const { error } = await supabase.from("variant_images").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Deletes an image. If it was the preview, the next image (by sort order)
 * is promoted so a variant with images always keeps a preview.
 */
export async function deleteVariantImage(imageId: string): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { data: target, error: targetErr } = await supabase
    .from("variant_images")
    .select("id,variant_id,is_preview")
    .eq("id", imageId)
    .maybeSingle();
  if (targetErr) throw new Error(targetErr.message);
  if (!target) return;

  const { error: delErr } = await supabase
    .from("variant_images")
    .delete()
    .eq("id", imageId);
  if (delErr) throw new Error(delErr.message);

  if (!target.is_preview) return;

  const { data: remaining, error: remErr } = await supabase
    .from("variant_images")
    .select("id")
    .eq("variant_id", target.variant_id)
    .order("sort_order", { ascending: true })
    .limit(1);
  if (remErr) throw new Error(remErr.message);

  const promote = remaining?.[0];
  if (promote) {
    const { error: promoteErr } = await supabase
      .from("variant_images")
      .update({ is_preview: true })
      .eq("id", promote.id);
    if (promoteErr) throw new Error(promoteErr.message);
  }
}

/**
 * Marks one image as the variant's preview, clearing the flag on the others.
 * Clears first so the single-preview unique index never collides mid-update.
 */
export async function setPreviewImage(
  variantId: string,
  imageId: string,
): Promise<void> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();

  const { error: clearErr } = await supabase
    .from("variant_images")
    .update({ is_preview: false })
    .eq("variant_id", variantId)
    .neq("id", imageId);
  if (clearErr) throw new Error(clearErr.message);

  const { error: setErr } = await supabase
    .from("variant_images")
    .update({ is_preview: true })
    .eq("id", imageId)
    .eq("variant_id", variantId);
  if (setErr) throw new Error(setErr.message);
}

export async function getImagesForVariant(
  variantId: string,
): Promise<VariantImage[]> {
  await requireAdminOrManagerProfile();
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("variant_images")
    .select(IMAGE_COLUMNS)
    .eq("variant_id", variantId)
    .order("is_preview", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as VariantImage[];
}
