import type { MetadataRoute } from "next";

import { BRAND_SHORT_NAME, MANAGE_APP_NAME } from "@/modules/brand/lib/brand";

const APP_NAME = MANAGE_APP_NAME;
const THEME_COLOR = "#2563EB";
const BACKGROUND_COLOR = "#f8fafc";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: BRAND_SHORT_NAME,
    description: "B2B electronics store operations and supplier portal",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "any",
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Admin home",
        short_name: "Admin",
        url: "/admin",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Sales orders",
        short_name: "Orders",
        url: "/admin/erp/sales-orders",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
