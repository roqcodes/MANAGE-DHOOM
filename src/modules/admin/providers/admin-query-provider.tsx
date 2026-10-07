"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

const defaultOptions = {
  queries: {
    staleTime: 90_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  },
};

export function AdminQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions,
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
