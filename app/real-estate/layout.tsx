import type { ReactNode } from "react";
import { CommandPaletteProvider } from "@/components/real-estate/workspace";

/**
 * Root layout for /real-estate/*. Mounting the CommandPaletteProvider here
 * lets ⌘K work on every REBM page without each page importing it.
 *
 * Anything that needs to live above all REBM pages (toasts, in-app help,
 * onboarding banners) belongs in this file too.
 */
export default function RealEstateLayout({ children }: { children: ReactNode }) {
  return <CommandPaletteProvider>{children}</CommandPaletteProvider>;
}
