import "server-only";

import { UserRole } from "@/common/auth/types";
import { getCurrentSessionProfile } from "@/modules/auth/services/auth.service";

export async function requireAdminOrManagerProfile() {
  const { profile } = await getCurrentSessionProfile();
  if (
    !profile?.role ||
    (profile.role !== UserRole.Admin && profile.role !== UserRole.Manager)
  ) {
    throw new Error("Unauthorized.");
  }
  return profile;
}

export async function requireAdminOnlyProfile() {
  const { profile } = await getCurrentSessionProfile();
  if (!profile || profile.role !== UserRole.Admin) {
    throw new Error("Unauthorized: admin only.");
  }
  return profile;
}

/** Supply-side portal: `users.id` matches `vendors.id` for portal vendor accounts. */
export async function requireVendorProfile() {
  const { profile } = await getCurrentSessionProfile();
  if (!profile?.role || profile.role !== UserRole.Vendor) {
    throw new Error("Unauthorized.");
  }
  return profile;
}
