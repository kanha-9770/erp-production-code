import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConditionalLayout } from "@/components/layout/ConditionalLayout";
import { ReduxProvider } from "@/lib/providers/StoreProvider";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import PushInit from "@/components/push/push-init";
const inter = Inter({ subsets: ["latin"] });
export const metadata: Metadata = {
  title: "ERP System",
  description: "Complete Enterprise Resource Planning System",
  generator: "Complete Enterprise Resource Planning System",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Inline density bootstrap. Runs before the body paints so the user
          never sees a flash at the wrong size while React hydrates. Reads
          the same localStorage key the PreferencesTab writes to.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var raw = localStorage.getItem('profile.preferences.v1');
                  if (raw) {
                    var p = JSON.parse(raw);
                    var d = p && p.density === 'compact' ? 'compact' : 'comfortable';
                    document.documentElement.dataset.density = d;
                    var s = (p && typeof p.densityScale === 'number') ? p.densityScale : 1;
                    if (d === 'compact') {
                      if (s < 0.85) s = 0.85;
                      if (s > 1) s = 1;
                    } else {
                      s = 1;
                    }
                    document.documentElement.style.setProperty('--density-scale', String(s));
                    return;
                  }
                  // No saved preference: mobile defaults to compact @ 85%, desktop stays at 100%.
                  // 768px matches the project's MOBILE_BREAKPOINT (hooks/use-mobile.tsx).
                  function applyMobileAware(){
                    var isMobile = window.matchMedia('(max-width: 767px)').matches;
                    if (isMobile) {
                      document.documentElement.dataset.density = 'compact';
                      document.documentElement.style.setProperty('--density-scale', '0.85');
                    } else {
                      document.documentElement.dataset.density = 'comfortable';
                      document.documentElement.style.setProperty('--density-scale', '1');
                    }
                  }
                  applyMobileAware();
                  try {
                    var mql = window.matchMedia('(max-width: 767px)');
                    if (mql.addEventListener) mql.addEventListener('change', applyMobileAware);
                    else if (mql.addListener) mql.addListener(applyMobileAware);
                  } catch (e) {}
                } catch (e) {}
              })();
            `,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <ReduxProvider>
            <ConditionalLayout>{children}</ConditionalLayout>
            <PushInit />
            <Toaster />
          </ReduxProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
