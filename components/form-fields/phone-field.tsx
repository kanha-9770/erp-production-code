"use client";

/**
 * PhoneField — the ERP-wide standard phone / mobile input.
 *
 * A separate Country Code dropdown + a local number input. The value is a
 * single combined string ("<code> <number>", e.g. "+91 9999900000") stored in
 * the existing text column — so adopting this needs NO schema/DB change, and
 * any country number round-trips. Use everywhere a phone/mobile is captured so
 * the behaviour is consistent and future fields get it for free.
 *
 * Controlled: parent owns the combined string; this re-derives the split on
 * every render from `value`.
 */

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { DIAL_CODES, flagForDialCode, splitPhone, joinPhone } from "@/lib/dial-codes";

export interface PhoneFieldProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Red-border the number input to flag a validation error. */
  hasError?: boolean;
  id?: string;
  className?: string;
  /** Width of the country-code trigger. */
  codeWidth?: string;
}

export function PhoneField({
  value,
  onChange,
  placeholder = "Phone number",
  disabled,
  hasError,
  id,
  className,
  codeWidth = "w-[92px]",
}: PhoneFieldProps) {
  const { code, number } = splitPhone(value);

  return (
    <div className={cn("flex gap-1.5", className)}>
      <Select value={code} onValueChange={(c) => onChange(joinPhone(c, number))} disabled={disabled}>
        <SelectTrigger className={cn(codeWidth, "flex-none px-2 gap-1")} aria-label="Country code">
          <SelectValue>
            <span className="flex items-center gap-1 text-sm">
              <span className="leading-none">{flagForDialCode(code)}</span>
              <span className="tabular-nums">{code}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {DIAL_CODES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              <span className="flex items-center gap-2">
                <span>{c.flag}</span>
                <span className="font-medium tabular-nums w-12">{c.code}</span>
                <span className="text-muted-foreground">{c.country}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        inputMode="tel"
        autoComplete="tel-national"
        value={number}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(joinPhone(code, e.target.value))}
        className={cn("flex-1", hasError && "border-destructive")}
      />
    </div>
  );
}
