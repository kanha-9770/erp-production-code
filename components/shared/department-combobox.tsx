"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Department picker: dropdown of names already in use across the org +
// inline "type custom" mode for when HR is creating a brand-new department.
// Switching to custom is one click; once a typed name is saved it'll show
// up in the dropdown for the next form open.
//
// Shared between the Employee Master form (components/employee/employee-form)
// and User Management (/settings/users) so both controls offer the same
// org-derived department list — there's no separate Department table to
// maintain; `options` is derived from existing employees by each caller.
export function DepartmentCombobox({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const valueInOptions = !!value && options.includes(value);
  const [mode, setMode] = useState<"select" | "custom">(
    options.length === 0 || (value && !valueInOptions) ? "custom" : "select",
  );
  if (mode === "select" && options.length > 0) {
    return (
      <div className="flex gap-2">
        <Select
          value={value || undefined}
          onValueChange={(v) => {
            if (v === "__new__") {
              setMode("custom");
              onChange("");
              return;
            }
            onChange(v);
          }}
        >
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Select a department" />
          </SelectTrigger>
          <SelectContent>
            {options.map((d) => (
              <SelectItem key={d} value={d}>
                {d}
              </SelectItem>
            ))}
            <SelectItem value="__new__">+ Add new department…</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Engineering"
        className="flex-1"
        autoFocus={mode === "custom"}
      />
      {options.length > 0 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setMode("select")}
        >
          Pick existing
        </Button>
      )}
    </div>
  );
}
