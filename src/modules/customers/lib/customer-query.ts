/** PostgREST filter: storefront + ERP customers, excluding staff roles. */
export const CUSTOMER_ROLE_OR_FILTER = "role.is.null,role.eq.customer";

export {
  buildIlikePattern,
  buildPrefixIlikePattern,
  escapeIlikePattern,
  sanitizePostgrestOrTerm,
} from "@/lib/postgrest-search";
