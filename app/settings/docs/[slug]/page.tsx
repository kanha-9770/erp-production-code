"use client"

import { useParams } from "next/navigation"
import Link from "next/link"
import {
  BookOpen,
  ChevronRight,
  Clock,
  Layers,
  Workflow,
  ArrowRight,
  Lightbulb,
  TestTube2,
  Play,
  Sparkles,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { ExternalLink, Footprints } from "lucide-react"
import { getGuide, foundationSequence } from "@/lib/docs/guides"
import { CodeBlock } from "@/components/docs/CodeBlock"
import { FlowDiagram } from "@/components/docs/FlowDiagram"
import { GuideTodos } from "@/components/docs/GuideTodos"

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>()
  const guide = getGuide(String(slug))

  if (!guide) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
        <h1 className="mb-2 text-2xl font-semibold">Guide not found</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          No guide with slug &quot;{slug}&quot;.
        </p>
        <Link
          href="/settings/docs"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ChevronRight className="h-4 w-4 rotate-180" /> Back to Documentation
        </Link>
      </div>
    )
  }

  const diffColor: Record<string, string> = {
    Beginner: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    Intermediate: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    Advanced: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30",
  }

  const isWalkthrough = guide.kind === "walkthrough"
  const foundationIndex = foundationSequence.indexOf(guide.slug)
  const inFoundation = foundationIndex !== -1
  const nextFoundationSlug =
    inFoundation && foundationIndex < foundationSequence.length - 1
      ? foundationSequence[foundationIndex + 1]
      : null
  const prevFoundationSlug =
    inFoundation && foundationIndex > 0
      ? foundationSequence[foundationIndex - 1]
      : null

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-background">
        <div className="px-4 py-4 sm:px-6">
          <nav className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Link href="/settings" className="hover:text-foreground">
              Setup
            </Link>
            <ChevronRight className="h-3 w-3" />
            <Link href="/settings/docs" className="hover:text-foreground">
              Documentation
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground">{guide.title}</span>
          </nav>

          <div className="mb-1 flex flex-wrap items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold text-foreground">{guide.title}</h1>
            <Badge variant="secondary" className="text-[10px]">
              {guide.category}
            </Badge>
            <span
              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                diffColor[guide.difficulty]
              }`}
            >
              {guide.difficulty}
            </span>
            {isWalkthrough && (
              <Badge
                variant="outline"
                className="border-primary/40 text-[10px] text-primary"
              >
                Walkthrough
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{guide.tagline}</p>

          <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> ~{guide.estimatedMinutes} min
            </span>
            <span className="inline-flex items-center gap-1">
              <Layers className="h-3 w-3" />
              Modules:{" "}
              {guide.modules.map((m, i) => (
                <span key={m}>
                  <code className="rounded bg-muted px-1 py-0.5 text-[10px] text-foreground">
                    {m}
                  </code>
                  {i < guide.modules.length - 1 && ", "}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
          {/* Main content */}
          <main className="min-w-0 space-y-6">
            {/* Foundation sequence progress (only for guides in the sequence) */}
            {inFoundation && (
              <div className="rounded-lg border bg-gradient-to-r from-primary/5 to-transparent p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                  <Footprints className="h-3.5 w-3.5 text-primary" />
                  Foundation · Step {foundationIndex + 1} of{" "}
                  {foundationSequence.length}
                </div>
                <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-[width] duration-500"
                    style={{
                      width: `${
                        ((foundationIndex + 1) / foundationSequence.length) * 100
                      }%`,
                    }}
                  />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  You&apos;re building the foundation — Module → Form → Fields →
                  APIs → Function → Workflow. Complete these six guides and
                  you&apos;ll be ready for any of the automation examples.
                </p>
              </div>
            )}

            {/* Live diagram — only when there's a workflow config to animate */}
            {!isWalkthrough && guide.workflow && <FlowDiagram guide={guide} />}

            {/* Use case */}
            <section className="rounded-lg border bg-muted/30 p-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                {isWalkthrough ? "What this covers" : "When to use this"}
              </div>
              <p className="text-sm leading-relaxed text-foreground">{guide.useCase}</p>
              {isWalkthrough && guide.primaryLink && (
                <Link
                  href={guide.primaryLink.href}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <ExternalLink className="h-3 w-3" />
                  {guide.primaryLink.label}
                </Link>
              )}
            </section>

            {/* Walkthrough-only: Step-by-step instructions */}
            {isWalkthrough && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Play className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Step-by-step
                  </h2>
                </div>
                <ol className="space-y-2">
                  {guide.todos.map((t, i) => (
                    <li
                      key={t.id}
                      className="flex items-start gap-3 rounded-md border bg-background p-3"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-sm leading-relaxed text-foreground">
                        {t.text}
                      </span>
                    </li>
                  ))}
                </ol>
                <Alert className="mt-4">
                  <Lightbulb className="h-4 w-4" />
                  <AlertTitle className="text-sm">Tip</AlertTitle>
                  <AlertDescription className="text-xs">
                    Tick each step off in the sidebar checklist on the right —
                    your progress is saved in this browser.
                  </AlertDescription>
                </Alert>
              </section>
            )}

            {/* Workflow config — only for example kind */}
            {!isWalkthrough && guide.workflow && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">
                    Workflow configuration
                  </h2>
                </div>
                <div className="overflow-hidden rounded-md border">
                  <table className="w-full text-sm">
                    <tbody>
                      <Row
                        k="Module"
                        v={<code className="text-xs">{guide.workflow.module}</code>}
                      />
                      <Row k="Execute based on" v={guide.workflow.executeBasedOn} />
                      {guide.workflow.recordAction && (
                        <Row k="Record action" v={guide.workflow.recordAction} />
                      )}
                      {guide.workflow.conditions && (
                        <Row k="Conditions" v={guide.workflow.conditions} />
                      )}
                      <Row k="Instant action" v={guide.workflow.instantAction} />
                      <Row
                        k="Active"
                        v="✓ required — inactive rules are silently skipped"
                      />
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Script — render whenever a guide provides one */}
            {guide.script && (
              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">
                      {isWalkthrough ? "Sample script" : "The function script"}
                    </h2>
                  </div>
                  <Link
                    href="/settings/functions"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Open Functions <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
                <CodeBlock
                  caption={`${guide.slug.replace(/-/g, "_")}.js`}
                  code={guide.script}
                />
                {!isWalkthrough && (
                  <Alert>
                    <Lightbulb className="h-4 w-4" />
                    <AlertTitle className="text-sm">Before you paste</AlertTitle>
                    <AlertDescription className="text-xs">
                      Run{" "}
                      <code className="rounded bg-muted px-1 py-0.5">
                        await ctx.records.fields(&quot;{guide.modules[0]}&quot;)
                      </code>{" "}
                      in the editor first to confirm the apiName of each field
                      this script references. Exact spelling matters — apiNames
                      are case-sensitive.
                    </AlertDescription>
                  </Alert>
                )}
              </section>
            )}

            {/* Demo */}
            {(guide.demoInput || guide.demoOutput) && (
              <section>
                <div className="mb-3 flex items-center gap-2">
                  <TestTube2 className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">Demo example</h2>
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {guide.demoInput && (
                    <div className="rounded-md border bg-muted/20 p-3">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        Input
                      </div>
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                        {guide.demoInput}
                      </pre>
                    </div>
                  )}
                  {guide.demoOutput && (
                    <div className="rounded-md border bg-emerald-500/10 p-3">
                      <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                        Expected result
                      </div>
                      <pre className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                        {guide.demoOutput}
                      </pre>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* Try it live — only for example kind */}
            {!isWalkthrough && (
              <>
                <Separator />
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <Play className="h-4 w-4 text-muted-foreground" />
                    <h2 className="text-lg font-semibold text-foreground">
                      Try it live
                    </h2>
                  </div>
                  <ol className="ml-5 list-decimal space-y-2 text-sm">
                    <li>
                      Go to{" "}
                      <Link
                        href="/settings/functions"
                        className="text-primary hover:underline"
                      >
                        Functions
                      </Link>{" "}
                      and create a new function with category{" "}
                      <strong>Automation</strong>.
                    </li>
                    <li>Paste the script above, adjust apiNames, and Save.</li>
                    <li>
                      Go to{" "}
                      <Link
                        href="/settings/workflow-rules/create"
                        className="text-primary hover:underline"
                      >
                        Workflow Rules → Create
                      </Link>{" "}
                      and apply the config from the table above.
                    </li>
                    <li>
                      Mark the rule <strong>Active</strong> and save.
                    </li>
                    <li>
                      Exercise the trigger — follow the checklist on the right.
                    </li>
                  </ol>
                </section>
              </>
            )}

            {/* Foundation navigation */}
            {inFoundation && (
              <div className="flex items-center justify-between gap-3 border-t pt-4">
                {prevFoundationSlug ? (
                  <Link
                    href={`/settings/docs/${prevFoundationSlug}`}
                    className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <ChevronRight className="h-4 w-4 rotate-180" /> Previous
                  </Link>
                ) : (
                  <span />
                )}
                {nextFoundationSlug ? (
                  <Link
                    href={`/settings/docs/${nextFoundationSlug}`}
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Next step <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    href="/settings/docs/duplicate-leads"
                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                  >
                    Try your first automation{" "}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )}
          </main>

          {/* Sidebar — Todos */}
          <aside className="min-w-0 lg:sticky lg:top-6 lg:h-fit">
            <GuideTodos slug={guide.slug} todos={guide.todos} />
            <div className="mt-4 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              <p className="mb-1 font-medium text-foreground">Need more guides?</p>
              <Link
                href="/settings/docs"
                className="inline-flex items-center gap-1 text-primary hover:underline"
              >
                Browse all 20+ examples{" "}
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <tr className="even:bg-muted/30">
      <td className="w-40 border-r px-3 py-2 text-xs font-medium text-muted-foreground">
        {k}
      </td>
      <td className="px-3 py-2 text-xs text-foreground">{v}</td>
    </tr>
  )
}
