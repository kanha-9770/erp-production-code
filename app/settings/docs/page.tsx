"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import {
  BookOpen,
  Search,
  ArrowRight,
  Clock,
  CheckCircle2,
  Zap,
  Workflow,
  Footprints,
  Rocket,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { guides, categories, foundationSequence, getGuide, type GuideCategory } from "@/lib/docs/guides"

const TODOS_KEY = "docs:guide-todos:v1"

export default function DocsIndexPage() {
  const [query, setQuery] = useState("")
  const [activeCategory, setActiveCategory] = useState<GuideCategory | "All">("All")
  const [progress, setProgress] = useState<Record<string, { done: number; total: number }>>(
    {}
  )

  // Read localStorage progress for every guide on mount so the index shows
  // completion stats next to each card.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(TODOS_KEY)
      const state = raw ? JSON.parse(raw) : {}
      const next: Record<string, { done: number; total: number }> = {}
      for (const g of guides) {
        const gs = state[g.slug] || {}
        const done = g.todos.filter((t) => gs[t.id]).length
        next[g.slug] = { done, total: g.todos.length }
      }
      setProgress(next)
    } catch {
      /* ignore */
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return guides.filter((g) => {
      if (activeCategory !== "All" && g.category !== activeCategory) return false
      if (!q) return true
      return (
        g.title.toLowerCase().includes(q) ||
        g.tagline.toLowerCase().includes(q) ||
        g.useCase.toLowerCase().includes(q) ||
        g.modules.some((m) => m.toLowerCase().includes(q))
      )
    })
  }, [query, activeCategory])

  const totalDone = Object.values(progress).reduce((sum, p) => sum + p.done, 0)
  const totalItems = Object.values(progress).reduce((sum, p) => sum + p.total, 0)
  const overallPct = totalItems === 0 ? 0 : Math.round((totalDone / totalItems) * 100)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="px-4 py-4 sm:px-6">
          <div className="mb-1 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">Documentation</h1>
            <Badge variant="secondary" className="ml-1 text-[10px]">
              {guides.length} guides
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Worked examples of Functions + Workflow Rules. Each guide includes a
            script, workflow config, live flow diagram, demo example, and a todo
            checklist (saved in your browser).
          </p>
        </div>
      </div>

      {/* Hero / overview */}
      <div className="border-b bg-gradient-to-br from-primary/5 via-background to-background">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <HeroTile
              icon={Zap}
              title={`${guides.length} guides`}
              sub="Covering module setup, form design, functions, and workflows."
            />
            <HeroTile
              icon={Workflow}
              title="Live flow diagrams"
              sub="Choreographed SVG animation for every automation example."
            />
            <HeroTile
              icon={CheckCircle2}
              title={`${overallPct}% overall progress`}
              sub={`${totalDone}/${totalItems} steps completed across all guides.`}
              progress={overallPct}
            />
          </div>
        </div>
      </div>

      {/* Foundation / Start-here sequence */}
      <div className="border-b bg-background">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <Rocket className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">
                Start here — the foundation
              </h2>
              <p className="text-xs text-muted-foreground">
                The complete path from empty ERP to your first working automation.
                Follow these six in order.
              </p>
            </div>
          </div>
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {foundationSequence.map((slug, i) => {
              const g = getGuide(slug)
              if (!g) return null
              const p = progress[slug] || { done: 0, total: g.todos.length }
              const complete = p.done === p.total && p.total > 0
              return (
                <Link
                  key={slug}
                  href={`/settings/docs/${slug}`}
                  className="group relative flex items-start gap-3 rounded-lg border bg-background p-3 transition-all hover:border-primary/40 hover:shadow-sm"
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      complete
                        ? "bg-emerald-500 text-white"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
                        {g.title}
                      </h3>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {g.tagline}
                    </p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {g.estimatedMinutes} min
                      </span>
                      <span>
                        {p.done}/{p.total}
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </ol>
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            <Footprints className="h-3 w-3" />
            Completing all six unlocks any of the 22 automation recipes below.
          </div>
        </div>
      </div>

      {/* Search + category filters */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search guides by title, module, or use case…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <CategoryChip
              label="All"
              active={activeCategory === "All"}
              onClick={() => setActiveCategory("All")}
              count={guides.length}
            />
            {categories.map((c) => {
              const count = guides.filter((g) => g.category === c).length
              if (count === 0) return null
              return (
                <CategoryChip
                  key={c}
                  label={c}
                  active={activeCategory === c}
                  onClick={() => setActiveCategory(c)}
                  count={count}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* Guide grid */}
      <div className="px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-6xl">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No guides match — try a different search or category.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((g) => {
                const p = progress[g.slug] || { done: 0, total: g.todos.length }
                const pct = p.total === 0 ? 0 : Math.round((p.done / p.total) * 100)
                return (
                  <Link
                    key={g.slug}
                    href={`/settings/docs/${g.slug}`}
                    className="group relative flex flex-col overflow-hidden rounded-lg border bg-background p-5 shadow-sm transition-all hover:border-primary/40 hover:shadow-md"
                  >
                    {/* subtle top progress bar */}
                    {pct > 0 && (
                      <div className="absolute inset-x-0 top-0 h-0.5 bg-muted">
                        <div
                          className="h-full bg-primary transition-[width]"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}
                    <div className="mb-3 flex items-start justify-between">
                      <Badge
                        variant="secondary"
                        className="text-[10px] font-normal"
                      >
                        {g.category}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </div>
                    <h2 className="mb-1 text-sm font-semibold text-foreground group-hover:text-primary">
                      {g.title}
                    </h2>
                    <p className="mb-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {g.tagline}
                    </p>

                    <div className="mt-auto space-y-2">
                      <div className="flex flex-wrap gap-1">
                        {g.modules.slice(0, 3).map((m) => (
                          <code
                            key={m}
                            className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground"
                          >
                            {m}
                          </code>
                        ))}
                      </div>
                      <div className="flex items-center justify-between border-t pt-2 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {g.estimatedMinutes} min
                        </span>
                        <span>
                          {g.difficulty} · {p.done}/{p.total}
                        </span>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function HeroTile({
  icon: Icon,
  title,
  sub,
  progress,
}: {
  icon: any
  title: string
  sub: string
  progress?: number
}) {
  return (
    <div className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
          <Icon className="h-3.5 w-3.5 text-primary" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{sub}</p>
      {typeof progress === "number" && (
        <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}

function CategoryChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string
  active: boolean
  onClick: () => void
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1 py-0 text-[10px] ${
          active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  )
}
