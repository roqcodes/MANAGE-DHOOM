/** Remove routes from this set to show them in admin nav again. */
export const TEMPORARILY_HIDDEN_ADMIN_ROUTES = new Set([
  "/admin/delivery",
]);

export function isAdminRouteHidden(href: string): boolean {
  return TEMPORARILY_HIDDEN_ADMIN_ROUTES.has(href);
}
