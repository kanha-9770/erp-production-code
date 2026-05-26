"use client";

import { useState, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Compact "label + selected value" button that opens a popover with the
 * full option list. Used in place of inline chip rows when the option
 * list would sprawl onto multiple lines.
 *
 *  - Trigger reads `LABEL [value ⌄]` (e.g. `STATUS [Active ⌄]`)
 *  - Popover lists every option with a check mark on the active one
 *  - The "All" entry at the top clears the filter
 *  - Clicking the active option again also clears it
 *  - Long lists scroll inside the popover (`max-h-72`)
 *
 * The `value` is a controlled string. Use the empty string `""` to
 * represent the "All / no filter" state — matches the convention used
 * by `FilterChips`.
 */
export interface SelectFilterOption {
  value: string;
  label: ReactNode;
}

export interface SelectFilterProps {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: SelectFilterOption[];
  /** Override the popover width (default `w-52`). */
  contentClassName?: string;
  /** Override the trigger className. */
  triggerClassName?: string;
}

export function SelectFilter({
  label,
  value,
  onChange,
  options,
  contentClassName,
  triggerClassName,
}: SelectFilterProps) {
  const [open, setOpen] = useState(false);
  const active = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 px-2.5 text-xs gap-1.5 shrink-0",
            triggerClassName,
          )}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className={cn("text-xs", !active && "text-muted-foreground")}>
            {active ? active.label : "All"}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className={cn("w-52 p-1", contentClassName)}
      >
        <ul className="space-y-0.5 max-h-72 overflow-y-auto">
          <li>
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                !value
                  ? "bg-primary/10 text-primary font-medium"
                  : "hover:bg-muted",
              )}
            >
              <Check
                className={cn(
                  "h-3.5 w-3.5",
                  !value ? "opacity-100" : "opacity-0",
                )}
              />
              All
            </button>
          </li>
          {options.map((o) => {
            const isActive = value === o.value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(isActive ? "" : o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "hover:bg-muted",
                  )}
                >
                  <Check
                    className={cn(
                      "h-3.5 w-3.5",
                      isActive ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {o.label}
                </button>
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-2 py-3 text-xs text-muted-foreground text-center">
              No options
            </li>
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
