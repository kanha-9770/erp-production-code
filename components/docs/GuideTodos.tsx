"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, RotateCcw } from "lucide-react"
import type { GuideTodo } from "@/lib/docs/guides"

const STORAGE_KEY = "docs:guide-todos:v1"

type TodoState = Record<string, Record<string, boolean>>

function readState(): TodoState {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeState(state: TodoState) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function GuideTodos({
  slug,
  todos,
}: {
  slug: string
  todos: GuideTodo[]
}) {
  const [state, setState] = useState<Record<string, boolean>>({})
  const [hydrated, setHydrated] = useState(false)

  // Hydrate from localStorage on mount.
  useEffect(() => {
    const all = readState()
    setState(all[slug] || {})
    setHydrated(true)
  }, [slug])

  const toggle = (id: string) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      const all = readState()
      all[slug] = next
      writeState(all)
      return next
    })
  }

  const reset = () => {
    setState({})
    const all = readState()
    delete all[slug]
    writeState(all)
  }

  const done = useMemo(
    () => todos.filter((t) => state[t.id]).length,
    [todos, state]
  )
  const pct = todos.length === 0 ? 0 : Math.round((done / todos.length) * 100)

  return (
    <div className="rounded-lg border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Your progress</h3>
          <p className="text-xs text-muted-foreground">
            Checked items are saved to this browser.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs font-medium text-foreground">
              {done}/{todos.length}
            </div>
            <div className="text-[10px] text-muted-foreground">{pct}%</div>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={done === 0}
            className="inline-flex items-center gap-1 rounded border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            title="Reset progress"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full bg-muted">
        <div
          className="h-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* List */}
      <ul className="divide-y">
        {todos.map((t, i) => {
          const checked = !!state[t.id]
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => toggle(t.id)}
                className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all ${
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background"
                  }`}
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                <span className="flex-1 text-sm leading-snug">
                  <span className="mr-1 font-mono text-[11px] text-muted-foreground">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={
                      checked
                        ? "text-muted-foreground line-through decoration-muted-foreground/50"
                        : "text-foreground"
                    }
                  >
                    {t.text}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      {hydrated && done === todos.length && todos.length > 0 && (
        <div className="border-t bg-emerald-500/10 px-4 py-2 text-center text-xs font-medium text-emerald-700 dark:text-emerald-400">
          🎉 All steps complete
        </div>
      )}
    </div>
  )
}
