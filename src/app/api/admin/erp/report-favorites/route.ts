import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getUserReportFavoriteSlugs,
  setUserReportFavoriteSlugs,
  toggleUserReportFavorite,
} from "@/modules/erp/services/user-report-favorites.service";

export async function GET() {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const slugs = await getUserReportFavoriteSlugs(auth.profile.id);
    return NextResponse.json({ slugs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to load favourites";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { slugs?: unknown };
    const slugs = await setUserReportFavoriteSlugs(auth.profile.id, body.slugs);
    return NextResponse.json({ slugs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to save favourites";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as { slug?: string };
    const slug = body.slug?.trim();
    if (!slug) {
      return NextResponse.json({ error: "slug is required" }, { status: 400 });
    }
    const slugs = await toggleUserReportFavorite(auth.profile.id, slug);
    return NextResponse.json({ slugs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Failed to update favourite";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
