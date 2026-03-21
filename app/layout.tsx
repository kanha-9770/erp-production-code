import type React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ConditionalLayout } from "@/components/layout/ConditionalLayout";
import { ReduxProvider } from "@/lib/providers/StoreProvider";
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
    <html lang="en">
      <body className={inter.className}>
        <ReduxProvider>
          <ConditionalLayout>{children}</ConditionalLayout>
        </ReduxProvider>
      </body>
    </html>
  );
}
