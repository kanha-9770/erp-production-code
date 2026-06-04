"use client";

/** Sticky save/discard bar shared by the object-form Organization Setup
 *  sections (Policy, Branding, Email Authentication). Owner-only. */

import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SetupSaveBar({
  dirty,
  saving,
  onSave,
  onDiscard,
  disabled,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      aria-live="polite"
      className={cn(
        "sticky bottom-0 -mx-4 sm:-mx-6 lg:-mx-8 mt-6 px-4 sm:px-6 lg:px-8 py-3",
        "bg-background/95 backdrop-blur border-t",
        "flex items-center justify-between gap-3 transition-opacity duration-150",
        !dirty && "opacity-60",
      )}
    >
      <p className="text-xs text-muted-foreground min-w-0 truncate">
        {dirty ? (
          <span className="font-medium text-foreground">Unsaved changes</span>
        ) : (
          "Changes apply org-wide once saved."
        )}
      </p>
      <div className="flex gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          onClick={onDiscard}
          disabled={!dirty || saving}
          className="h-9"
        >
          Discard
        </Button>
        <Button
          size="sm"
          onClick={onSave}
          disabled={!dirty || saving || disabled}
          className="h-9 min-w-[120px]"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              Save changes
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
