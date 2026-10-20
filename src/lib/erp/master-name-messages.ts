/** Client-safe duplicate-name messages (no server-only). */

export function trimMasterName(name: string): string {
  return name.trim();
}

const DUPLICATE_NAME_MESSAGES: Record<string, string> = {
  vendor: "This vendor name is already in use. Choose a different name.",
  product: "This product name is already in use. Choose a different name.",
  brand: "This brand name is already in use. Choose a different name.",
  store: "This store name is already in use. Choose a different name.",
  customer: "This customer name is already in use. Choose a different name.",
  category: "This category name is already in use at this level. Choose a different name.",
  variant: "This variant name is already in use on this product.",
  "variant group": "This variant group name is already in use on this product.",
  employee: "This employee name is already in use. Choose a different name.",
  account: "This account name is already in use. Choose a different name.",
  "account type": "This account type name is already in use in this category.",
};

export function duplicateMasterNameError(entityLabel: string): string {
  return (
    DUPLICATE_NAME_MESSAGES[entityLabel] ??
    `This ${entityLabel} name is already in use. Choose a different name.`
  );
}

export function rethrowUniqueNameViolation(
  error: { code?: string } | null,
  entityLabel: string,
): void {
  if (error?.code === "23505") {
    throw new Error(duplicateMasterNameError(entityLabel));
  }
}
