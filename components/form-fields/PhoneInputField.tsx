// components/form-fields/PhoneInputField.tsx
"use client";

import PhoneInput from "react-phone-number-input";
import "react-phone-number-input/style.css"; // or use "react-phone-number-input/style/high.css" for modern look
import { FormControl, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { cn } from "@/lib/utils";

interface PhoneInputFieldProps {
  field: any; // from react-hook-form
  label?: string;
  placeholder?: string;
  defaultCountry?: string;
  preferredCountries?: string[];
  className?: string;
}

export function PhoneInputField({
  field,
  label = "Phone Number",
  placeholder = "Enter phone number",
  defaultCountry = "IN",
  preferredCountries = ["IN", "US", "GB", "AE", "CA", "AU", "DE", "FR", "SA"],
  className,
}: PhoneInputFieldProps) {
  return (
    <FormItem className={cn("space-y-1.5", className)}>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <PhoneInput
          {...field}
          defaultCountry={defaultCountry}
          preferredCountries={preferredCountries}
          placeholder={placeholder}
          international
          countryCallingCodeEditable={false}
          numberInputProps={{
            className: cn(
              "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
              "ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
              "focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            ),
          }}
          // Optional: style country select button
          countrySelectProps={{
            className: "rounded-l-md border-r-0",
          }}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}