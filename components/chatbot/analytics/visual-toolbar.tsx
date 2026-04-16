"use client";

import { memo } from "react";
import { Download, MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface VisualToolbarItem {
  label: string;
  icon: React.ReactNode;
  hotkey?: string;
  onSelect: () => void | Promise<void>;
  destructive?: boolean;
}

export interface VisualToolbarGroup {
  label?: string;
  items: VisualToolbarItem[];
}

interface Props {
  groups: VisualToolbarGroup[];
  label?: string;
  /** Appears at top-right of the parent; parent must be `relative`. */
  className?: string;
  /** Show always (not just on hover). Useful for compact side-panel charts. */
  alwaysVisible?: boolean;
}

function VisualToolbarImpl({
  groups,
  label = "Export",
  className,
  alwaysVisible = false,
}: Props) {
  return (
    <div
      className={cn(
        "absolute top-2 right-2 z-10 transition-opacity duration-200",
        alwaysVisible
          ? "opacity-100"
          : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={label}
            aria-label={label}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border border-border/70 bg-background/95 backdrop-blur",
              "px-1.5 py-1 text-[10px] font-medium text-muted-foreground",
              "hover:bg-muted hover:text-foreground hover:border-border shadow-sm transition-colors"
            )}
          >
            <Download className="h-3 w-3" />
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {groups.map((g, gi) => (
            <div key={gi}>
              {gi > 0 && <DropdownMenuSeparator />}
              {g.label && (
                <DropdownMenuLabel className="text-[10px] font-medium text-muted-foreground tracking-wide">
                  {g.label}
                </DropdownMenuLabel>
              )}
              {g.items.map((it, ii) => (
                <DropdownMenuItem
                  key={ii}
                  onClick={() => void it.onSelect()}
                  className={cn(
                    "text-[12px]",
                    it.destructive && "text-destructive focus:text-destructive"
                  )}
                >
                  <span className="mr-2 shrink-0 text-muted-foreground">
                    {it.icon}
                  </span>
                  <span className="flex-1">{it.label}</span>
                  {it.hotkey && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {it.hotkey}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const VisualToolbar = memo(VisualToolbarImpl);
export default VisualToolbar;
