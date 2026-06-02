"use client"

/**
 * Route-segment error boundary.
 *
 * Next.js App Router renders this whenever a Server or Client Component
 * under `app/` throws during render. Without it, an uncaught error
 * unmounts the entire React tree and the user is left staring at a blank
 * white screen — no message, no way to recover (there's no dev overlay in
 * a production / PM2 build). This boundary turns that into a friendly,
 * recoverable card and logs the real error so it's diagnosable.
 *
 * It renders INSIDE the root layout, so it has access to the app's theme,
 * fonts and Tailwind. (Errors in the root layout itself are caught by
 * `app/global-error.tsx` instead.)
 */

import { useEffect } from "react"
import { AlertTriangle, RotateCcw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Surface the real error to the console / server logs so a blank-turned-
    // -card error is actually diagnosable.
    console.error("[route-error]", error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          This page hit an unexpected error. You can try again, or head back to
          the dashboard.
        </p>

        {/* Error message — helps the user report it and helps us diagnose.
            The digest is the production-safe id Next assigns to the error. */}
        {(error?.message || error?.digest) && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted/60 p-3 text-left text-[11px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
            {error.message || `Error reference: ${error.digest}`}
            {error.digest && error.message ? `\n\nRef: ${error.digest}` : ""}
          </pre>
        )}

        <div className="mt-5 flex items-center justify-center gap-2">
          <Button onClick={() => reset()} size="sm">
            <RotateCcw className="h-4 w-4 mr-1.5" />
            Try again
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              window.location.href = "/"
            }}
          >
            <Home className="h-4 w-4 mr-1.5" />
            Go to dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
