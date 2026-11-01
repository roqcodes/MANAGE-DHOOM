import "server-only";

import { getReportBySlug } from "@/common/erp/report-types";
import { createSupabaseServerClient } from "@/lib/integrations/supabase/server";

const MAX_FAVORITES = 40;

export function sanitizeReportFavoriteSlugs(slugs: unknown): string[] {
  if (!Array.isArray(slugs)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of slugs) {
    if (typeof raw !== "string") continue;
    const slug = raw.trim();
    if (!slug || seen.has(slug)) continue;
    if (!getReportBySlug(slug)) continue;
    seen.add(slug);
    out.push(slug);
    if (out.length >= MAX_FAVORITES) break;
  }
  return out;
}

export async function getUserReportFavoriteSlugs(userId: string): Promise<string[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_erp_preferences")
    .select("favorite_report_slugs")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return sanitizeReportFavoriteSlugs(data?.favorite_report_slugs ?? []);
}

async function saveUserReportFavoriteSlugs(userId: string, slugs: string[]): Promise<string[]> {
  const validated = sanitizeReportFavoriteSlugs(slugs);
  const supabase = await createSupabaseServerClient();
  const now = new Date().toISOString();

  const { data: existing, error: readError } = await supabase
    .from("user_erp_preferences")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (existing) {
    const { error: updateError } = await supabase
      .from("user_erp_preferences")
      .update({ favorite_report_slugs: validated, updated_at: now })
      .eq("user_id", userId);
    if (updateError) throw new Error(updateError.message);
  } else {
    const { error: insertError } = await supabase.from("user_erp_preferences").insert({
      user_id: userId,
      favorite_report_slugs: validated,
      updated_at: now,
    });
    if (insertError) throw new Error(insertError.message);
  }

  return validated;
}

export async function toggleUserReportFavorite(
  userId: string,
  slug: string,
): Promise<string[]> {
  const trimmed = slug.trim();
  if (!trimmed || !getReportBySlug(trimmed)) {
    throw new Error("Unknown report");
  }

  const current = await getUserReportFavoriteSlugs(userId);
  const next = new Set(current);
  if (next.has(trimmed)) next.delete(trimmed);
  else next.add(trimmed);
  return saveUserReportFavoriteSlugs(userId, [...next]);
}

export async function setUserReportFavoriteSlugs(
  userId: string,
  slugs: unknown,
): Promise<string[]> {
  return saveUserReportFavoriteSlugs(userId, sanitizeReportFavoriteSlugs(slugs));
}
