//Currently this file is not in the use created for the currency 

"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const currencySymbols: Record<string, string> = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  AED: "د.إ",
  SAR: "﷼",
  // Add more currencies as needed (you can expand this list)
};

interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value?: string | number;
  onChange?: (value: string) => void;           // clean numeric string (no symbol/commas)
  currency?: string;
  symbol?: string;
  symbolPosition?: "left" | "right";
  decimalPlaces?: number;
  showCurrencySelector?: boolean;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function CurrencyInput({
  value,
  onChange,
  currency = "INR",
  symbol: propSymbol,
  symbolPosition = "left",
  decimalPlaces = 2,
  showCurrencySelector = true,
  error,
  disabled,
  className,
  ...props
}: CurrencyInputProps) {
  const [currentCurrency, setCurrentCurrency] = React.useState(currency);
  const symbol = propSymbol || currencySymbols[currentCurrency] || "₹";

  // Format display value with commas & decimals
  const formatDisplay = (val: string | number | undefined): string => {
    if (val === "" || val === undefined) return "";
    const num = Number(val);
    if (isNaN(num)) return String(val);
    return num.toLocaleString("en-IN", {
      minimumFractionDigits: decimalPlaces,
      maximumFractionDigits: decimalPlaces,
    });
  };

  const displayValue = formatDisplay(value);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value
      .replace(/[^0-9.]/g, "")           // only allow numbers & dot
      .replace(/(\..*)\./g, "$1");       // only one dot

    // Optional: enforce decimal places
    if (raw.includes(".")) {
      const [int, dec] = raw.split(".");
      raw = `${int}.${dec.slice(0, decimalPlaces)}`;
    }

    if (onChange) onChange(raw);          // pass clean number string
  };

  return (
    <div className={cn("relative flex items-center group", className)}>
      {/* Left symbol */}
      {symbolPosition === "left" && (
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium pointer-events-none">
          {symbol}
        </div>
      )}

      <Input
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleInputChange}
        disabled={disabled}
        className={cn(
          "text-right font-medium pr-10",
          symbolPosition === "left" && "pl-10",
          error && "border-red-500 focus-visible:ring-red-500",
          disabled && "bg-gray-50 cursor-not-allowed"
        )}
        placeholder="0.00"
        {...props}
      />

      {/* Right symbol or currency selector */}
      {showCurrencySelector ? (
        <Select
          value={currentCurrency}
          onValueChange={setCurrentCurrency}
          disabled={disabled}
        >
          <SelectTrigger className="absolute right-0 h-full w-20 border-l rounded-none rounded-r-md bg-gray-50/80 hover:bg-gray-100">
            <SelectValue placeholder={currentCurrency} />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(currencySymbols).map(([code, sym]) => (
              <SelectItem key={code} value={code}>
                {code} ({sym})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        symbolPosition === "right" && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium pointer-events-none">
            {symbol}
          </div>
        )
      )}

      {error && (
        <p className="text-xs text-red-500 mt-1">{error}</p>
      )}
    </div>
  );
}