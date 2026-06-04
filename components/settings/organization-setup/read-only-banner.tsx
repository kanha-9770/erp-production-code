"use client";

import { Lock } from "lucide-react";

export function ReadOnlyBanner({ what }: { what: string }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30 px-4 py-3">
      <Lock className="h-4 w-4 mt-0.5 text-amber-700 dark:text-amber-400 shrink-0" />
      <p className="text-sm text-amber-900 dark:text-amber-200">
        Only the organization owner can change {what}.
      </p>
    </div>
  );
}
