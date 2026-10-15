import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import {
  BUYHUB_FAVICON_PATH,
  BUYHUB_ICON_PATH,
} from "@/modules/brand/components/buyhub-logo";
import { AppProviders } from "@/modules/admin/components/app-providers";
import { NavigationProgress } from "@/modules/navigation/components/navigation-progress";
import { AiAssistantRoot } from "@/modules/ai-assistant";
import { BuyHubPwa } from "@/modules/pwa/components/buyhub-pwa";
import { MANAGE_APP_NAME } from "@/modules/brand/lib/brand";
import "./globals.css";

const APP_NAME = MANAGE_APP_NAME;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: `%s · ${APP_NAME}`,
  },
  description: "B2B electronics store operations and supplier portal",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: BUYHUB_FAVICON_PATH, type: "image/png" }],
    apple: [{ url: BUYHUB_ICON_PATH, type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#EB205F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full overflow-hidden`}
    >
      <body className="h-full overflow-hidden bg-background font-sans text-foreground">
        <BuyHubPwa>
          <AppProviders>
            <AiAssistantRoot>
              <NavigationProgress />
              {children}
            </AiAssistantRoot>
          </AppProviders>
        </BuyHubPwa>
      </body>
    </html>
  );
}
