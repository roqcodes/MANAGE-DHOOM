import { NextResponse } from "next/server";

import { requireAdminApiProfile } from "@/lib/api/admin-api-auth";
import {
  getAvailableVariants,
  getVendorById,
  getVendorProducts,
} from "@/modules/vendors/services/vendors.service";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApiProfile();
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const [vendor, vendorProducts, availableVariants] = await Promise.all([
    getVendorById(id),
    getVendorProducts(id),
    getAvailableVariants(id),
  ]);

  if (!vendor) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ vendor, vendorProducts, availableVariants });
}
