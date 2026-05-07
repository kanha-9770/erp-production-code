"use client"

/**
 * Six-box OTP input — the kind users actually expect for 2FA / verification.
 *
 *  • Digit-only, auto-advances on type
 *  • Backspace at empty cell jumps to the previous cell
 *  • Pasting a 6-digit code anywhere fills all boxes at once
 *  • Submits on completion via the optional onComplete callback
 *  • Mobile: triggers numeric keypad via inputMode="numeric"
 *
 * Controlled-only: parent owns the `value` (a 0..6 char string) and reacts
 * to onChange. Reset by setting `value=""` from the parent.
 */

import * as React from "react"
import { cn } from "@/lib/utils"

export interface OtpInputProps {
  value: string
  onChange: (next: string) => void
  onComplete?: (code: string) => void
  length?: number
  disabled?: boolean
  autoFocus?: boolean
  className?: string
  /** Highlight all cells with destructive style — e.g. on a wrong-OTP error. */
  invalid?: boolean
}

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  autoFocus = true,
  className,
  invalid = false,
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([])

  React.useEffect(() => {
    if (autoFocus && !disabled) refs.current[0]?.focus()
  }, [autoFocus, disabled])

  const setDigit = (idx: number, digit: string) => {
    const sanitized = digit.replace(/\D/g, "").slice(0, 1)
    const arr = value.padEnd(length, " ").split("")
    arr[idx] = sanitized || " "
    const next = arr.join("").trimEnd()
    onChange(next)
    if (sanitized && idx < length - 1) refs.current[idx + 1]?.focus()
    if (next.replace(/\s/g, "").length === length) {
      onComplete?.(next.trim())
    }
  }

  const handleKeyDown = (idx: number) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault()
      const arr = value.padEnd(length, " ").split("")
      if (arr[idx] && arr[idx] !== " ") {
        arr[idx] = " "
        onChange(arr.join("").trimEnd())
      } else if (idx > 0) {
        arr[idx - 1] = " "
        onChange(arr.join("").trimEnd())
        refs.current[idx - 1]?.focus()
      }
      return
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      e.preventDefault()
      refs.current[idx - 1]?.focus()
    } else if (e.key === "ArrowRight" && idx < length - 1) {
      e.preventDefault()
      refs.current[idx + 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length)
    if (!text) return
    e.preventDefault()
    onChange(text)
    refs.current[Math.min(text.length, length - 1)]?.focus()
    if (text.length === length) onComplete?.(text)
  }

  return (
    <div className={cn("flex justify-center gap-2 sm:gap-3", className)} onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => {
        const ch = value[i] ?? ""
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={1}
            disabled={disabled}
            value={ch === " " ? "" : ch}
            onChange={(e) => setDigit(i, e.target.value)}
            onKeyDown={handleKeyDown(i)}
            onFocus={(e) => e.currentTarget.select()}
            className={cn(
              "h-12 w-10 sm:h-14 sm:w-12 text-center text-lg sm:text-xl font-semibold tabular-nums",
              "rounded-lg border bg-background transition-all",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              ch && !invalid && "border-primary/40 bg-primary/5",
              invalid && "border-destructive bg-destructive/5 text-destructive",
            )}
            aria-label={`Digit ${i + 1}`}
          />
        )
      })}
    </div>
  )
}
