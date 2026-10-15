/** Public legal pages base URL (no trailing slash). */
export function getPublicSiteOrigin(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return "http://localhost:3000";
}

export const LEGAL_ROUTES = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  deleteAccount: "/legal/delete-account",
} as const;

export function legalPageUrl(path: keyof typeof LEGAL_ROUTES): string {
  return `${getPublicSiteOrigin()}${LEGAL_ROUTES[path]}`;
}
