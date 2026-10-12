import type { QueryClient } from "@tanstack/react-query";

/** Invalidate all admin GET list/detail queries whose path starts with `pathPrefix`. */
export function invalidateAdminErpGetQueries(
  queryClient: QueryClient,
  pathPrefix: string,
): Promise<void> {
  return queryClient.invalidateQueries({
    queryKey: ["admin", "get"],
    predicate: (query) => {
      const path = query.queryKey[2];
      return typeof path === "string" && path.startsWith(pathPrefix);
    },
  });
}
