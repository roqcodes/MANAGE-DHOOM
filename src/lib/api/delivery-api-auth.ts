import { NextResponse } from "next/server";

import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";
import { UserRole } from "@/common/auth/types";

export async function requireDeliveryApiProfile() {
  try {
    const { user, profile } = await getCurrentSessionProfile();

    if (!user || !profile) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Unauthorized: User not authenticated" },
          { status: 401 },
        ),
      };
    }

    if (user.role !== UserRole.Delivery) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Forbidden: Delivery access required" },
          { status: 403 },
        ),
      };
    }

    if (!profile.is_verified) {
      return {
        ok: false as const,
        response: NextResponse.json(
          { error: "Forbidden: User not verified" },
          { status: 403 },
        ),
      };
    }

    return {
      ok: true as const,
      user,
      profile,
    };
  } catch (error) {
    console.error("Error checking delivery auth:", error);
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Unauthorized: User not authenticated" },
        { status: 401 },
      ),
    };
  }
}
