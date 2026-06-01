import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { ConditionalLayout } from "@/components/layout/ConditionalLayout";
import { DensityClientSync } from "@/components/layout/density-client-sync";
import { ReduxProvider } from "@/lib/providers/StoreProvider";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import PushInit from "@/components/push/push-init";
import { DENSITY_COOKIE, parseDensityCookie } from "@/lib/density-cookie";
const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = {
  title: "ERP System",
  description: "Complete Enterprise Resource Planning System",
  generator: "Complete Enterprise Resource Planning System",
  manifest: "/manifest.webmanifest",
  applicationName: "ERP System",
  appleWebApp: {
    capable: true,
    title: "ERP",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};
export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Density is rendered server-side from a cookie so first paint matches
  // the user's preference. Previously this was an inline bootstrap script,
  // but React 19 (Next.js 16) won't execute <script> tags inside
  // components and emits a warning for them — see lib/density-cookie.ts.
  const { density, scale } = parseDensityCookie(
    (await cookies()).get(DENSITY_COOKIE)?.value,
  );

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-density={density}
      style={{ ["--density-scale" as string]: String(scale) } as React.CSSProperties}
    >
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ReduxProvider>
            <DensityClientSync />
            <ConditionalLayout>{children}</ConditionalLayout>
            <PushInit />
            <Toaster />
          </ReduxProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
