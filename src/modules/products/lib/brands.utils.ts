import type { Brand } from "@/common/admin/types";

/** Brand image — single banner used as logo, icon, and hero everywhere. */
export function getBrandLogo(
  brand: Pick<Brand, "logo_url" | "image_url">,
): string | null {
  return brand.image_url?.trim() || brand.logo_url?.trim() || null;
}
