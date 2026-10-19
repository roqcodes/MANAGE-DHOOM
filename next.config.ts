import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { randomUUID } from "node:crypto";

const offlineShellRevision = randomUUID();

const withSerwist = withSerwistInit({
  swSrc: "src/sw.ts",
  swDest: "public/sw.js",
  additionalPrecacheEntries: [{ url: "/~offline", revision: offlineShellRevision }],
  disable:
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_ENABLE_PWA_DEV !== "true",
  register: false,
});

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/admin/manage",
        destination: "/admin/products",
        permanent: false,
      },
      { source: "/dashboard", destination: "/admin", permanent: false },
      { source: "/dashboard/:path*", destination: "/admin/:path*", permanent: false },
    ];
  },
};

export default withSerwist(nextConfig);
