import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

import {
  createStorefrontSupabaseForRequest,
  getStorefrontUserFromRequest,
} from "@/modules/storefront/lib/storefront-request-auth";
import {
  deleteStorefrontAccountForUser,
  getStorefrontDeletionPreview,
} from "@/modules/storefront/services/storefront-account-deletion.service";

/**
 * GET — deletion eligibility preview (App Store / Play in-app + web).
 * POST — permanently delete the signed-in storefront account.
 */
export async function GET(request: Request) {
  try {
    const user = await getStorefrontUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const supabase = await createStorefrontSupabaseForRequest(request);
    const preview = await getStorefrontDeletionPreview(supabase);
    return NextResponse.json(preview, { headers: CORS_HEADERS });
  } catch (error) {
    console.error("[storefront/account/delete] GET", error);
    return NextResponse.json(
      { error: "Failed to load deletion status" },
      { status: 500, headers: CORS_HEADERS },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await getStorefrontUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: CORS_HEADERS },
      );
    }

    const supabase = await createStorefrontSupabaseForRequest(request);
    await deleteStorefrontAccountForUser(supabase, user.id);
    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Account deletion failed";
    const status = message.includes("Unauthorized") ? 401 : 400;
    return NextResponse.json({ error: message }, { status, headers: CORS_HEADERS });
  }
}
