"use client"

/**
 * Global (root-layout) error boundary.
 *
 * This is the last line of defence: it catches errors thrown by the ROOT
 * layout itself (providers, theme, fonts) — the one place `app/error.tsx`
 * can't reach, because that boundary lives *inside* the root layout.
 *
 * Because it REPLACES the root layout when it renders, it must provide its
 * own <html> and <body>, and it cannot assume the app's CSS/theme is
 * available — so it is styled with inline styles only (no Tailwind classes,
 * no imported UI components).
 */

import { useEffect } from "react"

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[global-error]", error)
  }, [error])

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
          padding: "24px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "440px",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "12px",
            padding: "28px",
            textAlign: "center",
            boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
          }}
        >
          <div
            aria-hidden
            style={{
              margin: "0 auto",
              width: "48px",
              height: "48px",
              borderRadius: "9999px",
              background: "#fef3c7",
              color: "#d97706",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "24px",
              fontWeight: 700,
            }}
          >
            !
          </div>
          <h1 style={{ margin: "16px 0 4px", fontSize: "18px", fontWeight: 600 }}>
            Something went wrong
          </h1>
          <p style={{ margin: 0, fontSize: "14px", color: "#64748b" }}>
            The app hit an unexpected error. Please try again.
          </p>

          {(error?.message || error?.digest) && (
            <pre
              style={{
                marginTop: "16px",
                maxHeight: "160px",
                overflow: "auto",
                background: "#f1f5f9",
                borderRadius: "8px",
                padding: "12px",
                textAlign: "left",
                fontSize: "11px",
                lineHeight: 1.5,
                color: "#475569",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {error.message || `Error reference: ${error.digest}`}
            </pre>
          )}

          <div
            style={{
              marginTop: "20px",
              display: "flex",
              gap: "8px",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                cursor: "pointer",
                border: "none",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                background: "#5a4d96",
                color: "#ffffff",
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = "/"
              }}
              style={{
                cursor: "pointer",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                padding: "8px 16px",
                fontSize: "14px",
                fontWeight: 500,
                background: "#ffffff",
                color: "#0f172a",
              }}
            >
              Go to dashboard
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
