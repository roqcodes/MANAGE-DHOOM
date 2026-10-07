import type { Category } from "@/common/admin/types";

/** Returns indented label for dropdowns: "Parent › Child" */
export function formatCategoryOptionLabel(
  category: Category,
  all: Category[],
): string {
  if (!category.parent_id) return category.name ?? "Unnamed";
  const parent = all.find((c) => c.id === category.parent_id);
  return parent
    ? `${parent.name} › ${category.name}`
    : (category.name ?? "Unnamed");
}

/** Category/brand image — single banner used as icon, thumbnail, and hero everywhere. */
export function getCategoryThumbnail(
  category: Pick<Category, "thumbnail_url" | "image_url">,
): string | null {
  return category.image_url?.trim() || category.thumbnail_url?.trim() || null;
}

/** @deprecated Use getCategoryThumbnail — banner and thumbnail are the same asset. */
export function getCategoryBanner(
  category: Pick<Category, "thumbnail_url" | "image_url">,
): string | null {
  return getCategoryThumbnail(category);
}
