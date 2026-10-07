import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { NetworkOnly, Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Never cache transactional or auth API traffic as authoritative data. */
const apiNetworkOnly: RuntimeCaching = {
  matcher: ({ url: { pathname }, sameOrigin }) =>
    sameOrigin && pathname.startsWith("/api/"),
  handler: new NetworkOnly(),
};

/** Supabase (auth, REST, realtime) must always hit the network. */
const supabaseNetworkOnly: RuntimeCaching = {
  matcher: ({ url: { hostname } }) =>
    hostname.endsWith(".supabase.co") || hostname.endsWith(".supabase.in"),
  handler: new NetworkOnly(),
};

const runtimeCaching: RuntimeCaching[] = [
  apiNetworkOnly,
  supabaseNetworkOnly,
  // Drop Serwist defaults that cache GET /api/* (indexes 12–13 in defaultCache).
  ...defaultCache.slice(0, 12),
  ...defaultCache.slice(14),
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();
