"use client"

/**
 * Password input with show/hide toggle + optional strength meter and rules
 * checklist. Designed to drop in for any react-hook-form FormField.
 *
 * `withMeter` — render the live zxcvbn-style strength bar + colour
 * `withChecklist` — render the explicit "what's missing" line items
 *
 * The strength check runs purely client-side using checkPassword from
 * lib/auth/password-policy so the same rules render in both UI and server.
 */

import * as React from "react"
import { Eye, EyeOff, Lock, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { checkPassword, type PasswordCheck } from "@/lib/auth/password-policy"

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Show the strength bar + label below the input. */
  withMeter?: boolean
  /** Show the rules checklist (Use 10+ chars, Add a number, …) */
  withChecklist?: boolean
  /** Optional left icon override; defaults to Lock. */
  leftIcon?: React.ReactNode
  /** Hide the show/hide toggle (useful for "current password" fields). */
  noToggle?: boolean
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(
    {
      className,
      withMeter = false,
      withChecklist = false,
      leftIcon,
      noToggle = false,
      value,
      ...props
    },
    ref,
  ) {
    const [show, setShow] = React.useState(false)
    const v = String(value ?? "")
    const check: PasswordCheck | null = withMeter || withChecklist ? checkPassword(v) : null

    return (
      <div className="space-y-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {leftIcon ?? <Lock className="h-4 w-4" />}
          </span>
          <Input
            {...props}
            ref={ref}
            value={value}
            type={show ? "text" : "password"}
            className={cn("pl-10 pr-10 h-11", className)}
          />
          {!noToggle && (
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          )}
        </div>

        {withMeter && check && v.length > 0 && (
          <StrengthMeter check={check} />
        )}

        {withChecklist && check && v.length > 0 && (
          <RulesChecklist check={check} />
        )}
      </div>
    )
  },
)

function StrengthMeter({ check }: { check: PasswordCheck }) {
  const palette = [
    "bg-destructive",            // 0 — too short / common
    "bg-destructive",            // 1 — weak
    "bg-amber-500",              // 2 — fair
    "bg-emerald-500",            // 3 — good
    "bg-emerald-600",            // 4 — strong
  ]
  const labelColor = [
    "text-destructive",
    "text-destructive",
    "text-amber-600 dark:text-amber-400",
    "text-emerald-600 dark:text-emerald-400",
    "text-emerald-600 dark:text-emerald-400",
  ]
  return (
    <div className="space-y-1">
      <div className="flex h-1 gap-1 rounded-full overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-full transition-colors",
              i < check.score ? palette[check.score] : "bg-muted",
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn("font-medium uppercase tracking-wider", labelColor[check.score])}>
          {check.label}
        </span>
        {check.errors[0] && !check.ok && (
          <span className="text-muted-foreground truncate ml-2">
            {check.errors[0]}
          </span>
        )}
      </div>
    </div>
  )
}

function RulesChecklist({ check }: { check: PasswordCheck }) {
  const items: Array<[boolean, string]> = [
    [check.rules.minLength, "10+ characters"],
    [check.rules.lowercase, "Lowercase letter"],
    [check.rules.uppercase, "Uppercase letter"],
    [check.rules.digit, "A number"],
    [check.rules.symbolOrPhrase, "Symbol or 4+ letter run"],
    [check.rules.notCommon, "Not a common password"],
  ]
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {items.map(([ok, label]) => (
        <li
          key={label}
          className={cn(
            "flex items-center gap-1.5",
            ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
          )}
        >
          {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {label}
        </li>
      ))}
    </ul>
  )
}
