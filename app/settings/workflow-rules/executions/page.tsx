"use client"

/**
 * Admin page: Workflow execution history + summary.
 *
 * One screen, two parts:
 *   1. Summary cards across the top — total runs, success/failure mix,
 *      last run, total recipients in window. Powered by the same endpoint
 *      that returns the rows so the numbers and the rows can never disagree.
 *   2. Filterable log table — rule, trigger, status, time window. Each row
 *      expands to show the per-action `details` JSON the runner wrote.
 *
 * Filters debounce in URL query params so an admin can share a link to
 * "yesterday's failed schedule runs for rule X" with a teammate.
 */

import { Fragment, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, formatDistanceToNow, subDays, startOfDay } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  Filter,
} from "lucide-react"
import {
  useGetWorkflowExecutionsQuery,
  useGetWorkflowRulesQuery,
} from "@/lib/api/workflow-rules"

type ExecutionStatus = "all" | "success" | "partial" | "failed" | "skipped"
type ExecutionTrigger =
  | "all"
  | "schedule"
  | "manual"
  | "record-create"
  | "record-edit"
  | "record-delete"
type WindowChoice = "1d" | "7d" | "30d" | "90d"

const WINDOW_DAYS: Record<WindowChoice, number> = {
  "1d": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
}

function statusBadge(status: string) {
  const base = "text-[10px] px-1.5 py-0 font-medium"
  switch (status) {
    case "success":
      return <Badge className={`${base} bg-emerald-100 text-emerald-700 hover:bg-emerald-100`}>success</Badge>
    case "partial":
      return <Badge className={`${base} bg-amber-100 text-amber-700 hover:bg-amber-100`}>partial</Badge>
    case "failed":
      return <Badge className={`${base} bg-red-100 text-red-700 hover:bg-red-100`}>failed</Badge>
    case "skipped":
      return <Badge className={`${base} bg-slate-100 text-slate-600 hover:bg-slate-100`}>skipped</Badge>
    default:
      return <Badge className={`${base} bg-slate-100 text-slate-600 hover:bg-slate-100`}>{status}</Badge>
  }
}

function triggerBadge(trigger: string) {
  const base = "text-[10px] px-1.5 py-0 font-medium border"
  switch (trigger) {
    case "schedule":
      return <Badge variant="outline" className={`${base} border-indigo-200 text-indigo-700`}>schedule</Badge>
    case "manual":
      return <Badge variant="outline" className={`${base} border-blue-200 text-blue-700`}>manual</Badge>
    default:
      return <Badge variant="outline" className={base}>{trigger}</Badge>
  }
}

function fmtMs(ms: number | null) {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000)}s`
}

export default function WorkflowExecutionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [windowChoice, setWindowChoice] = useState<WindowChoice>(
    (searchParams.get("window") as WindowChoice) || "7d",
  )
  const [statusFilter, setStatusFilter] = useState<ExecutionStatus>(
    (searchParams.get("status") as ExecutionStatus) || "all",
  )
  const [triggerFilter, setTriggerFilter] = useState<ExecutionTrigger>(
    (searchParams.get("trigger") as ExecutionTrigger) || "all",
  )
  const [ruleFilter, setRuleFilter] = useState<string>(searchParams.get("ruleId") || "all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // URL sync — share links land back on the same view.
  useEffect(() => {
    const sp = new URLSearchParams()
    if (windowChoice !== "7d") sp.set("window", windowChoice)
    if (statusFilter !== "all") sp.set("status", statusFilter)
    if (triggerFilter !== "all") sp.set("trigger", triggerFilter)
    if (ruleFilter !== "all") sp.set("ruleId", ruleFilter)
    const qs = sp.toString()
    router.replace(qs ? `/settings/workflow-rules/executions?${qs}` : "/settings/workflow-rules/executions", {
      scroll: false,
    })
  }, [windowChoice, statusFilter, triggerFilter, ruleFilter, router])

  const since = useMemo(
    () => startOfDay(subDays(new Date(), WINDOW_DAYS[windowChoice])).toISOString(),
    [windowChoice],
  )

  const queryParams = useMemo(
    () => ({
      since,
      status: statusFilter === "all" ? undefined : statusFilter,
      trigger: triggerFilter === "all" ? undefined : triggerFilter,
      ruleId: ruleFilter === "all" ? undefined : ruleFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [since, statusFilter, triggerFilter, ruleFilter, page],
  )

  const { data, isLoading, isFetching, refetch } = useGetWorkflowExecutionsQuery(queryParams)
  const { data: rulesData } = useGetWorkflowRulesQuery()

  const executions = data?.data || []
  const summary = data?.summary
  const total = data?.pagination?.total ?? 0

  const successPct = useMemo(() => {
    if (!summary || summary.total === 0) return 0
    const ok = (summary.byStatus.success || 0) + (summary.byStatus.partial || 0) * 0.5
    return Math.round((ok / summary.total) * 100)
  }, [summary])

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => router.push("/settings/workflow-rules")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to rules
          </Button>
          <h1 className="text-lg font-semibold">Workflow Execution Log</h1>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px]">Total runs ({windowChoice})</CardDescription>
            <CardTitle className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-7 w-16" /> : summary?.total ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground">
              Last run:{" "}
              {summary?.lastRunAt
                ? formatDistanceToNow(new Date(summary.lastRunAt), { addSuffix: true })
                : "—"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px]">Success rate</CardDescription>
            <CardTitle className="text-2xl font-semibold flex items-center gap-2">
              {isLoading ? <Skeleton className="h-7 w-16" /> : `${successPct}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground">
              partials count as ½ success
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px]">Recipients reached</CardDescription>
            <CardTitle className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-7 w-16" /> : summary?.totalRecipients ?? 0}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground">
              Sum of email + notification recipients
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px]">Status mix</CardDescription>
            <CardTitle className="text-base font-semibold flex flex-wrap gap-1.5 pt-1">
              {isLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : (
                <>
                  {summary?.byStatus?.success ? (
                    <span className="text-emerald-600 flex items-center gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {summary.byStatus.success}
                    </span>
                  ) : null}
                  {summary?.byStatus?.partial ? (
                    <span className="text-amber-600 flex items-center gap-1 text-xs">
                      <CircleAlert className="h-3.5 w-3.5" /> {summary.byStatus.partial}
                    </span>
                  ) : null}
                  {summary?.byStatus?.failed ? (
                    <span className="text-red-600 flex items-center gap-1 text-xs">
                      <AlertCircle className="h-3.5 w-3.5" /> {summary.byStatus.failed}
                    </span>
                  ) : null}
                  {summary?.byStatus?.skipped ? (
                    <span className="text-slate-500 flex items-center gap-1 text-xs">
                      <CircleDashed className="h-3.5 w-3.5" /> {summary.byStatus.skipped}
                    </span>
                  ) : null}
                  {!summary?.total && (
                    <span className="text-xs text-muted-foreground">No runs yet</span>
                  )}
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground">
              {summary?.byTrigger?.schedule || 0} scheduled · {summary?.byTrigger?.manual || 0} manual
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="bg-background border rounded-md p-3 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-1">Filters:</span>

        <Select value={windowChoice} onValueChange={(v) => { setWindowChoice(v as WindowChoice); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1d" className="text-xs">Last 24 hours</SelectItem>
            <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
            <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
            <SelectItem value="90d" className="text-xs">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as ExecutionStatus); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            <SelectItem value="success" className="text-xs">Success</SelectItem>
            <SelectItem value="partial" className="text-xs">Partial</SelectItem>
            <SelectItem value="failed" className="text-xs">Failed</SelectItem>
            <SelectItem value="skipped" className="text-xs">Skipped</SelectItem>
          </SelectContent>
        </Select>

        <Select value={triggerFilter} onValueChange={(v) => { setTriggerFilter(v as ExecutionTrigger); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All triggers</SelectItem>
            <SelectItem value="schedule" className="text-xs">Scheduled</SelectItem>
            <SelectItem value="manual" className="text-xs">Manual</SelectItem>
            <SelectItem value="record-create" className="text-xs">Record create</SelectItem>
            <SelectItem value="record-edit" className="text-xs">Record edit</SelectItem>
            <SelectItem value="record-delete" className="text-xs">Record delete</SelectItem>
          </SelectContent>
        </Select>

        <Select value={ruleFilter} onValueChange={(v) => { setRuleFilter(v); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All rules</SelectItem>
            {(rulesData?.data || []).map((r: any) => (
              <SelectItem key={r.id} value={r.id} className="text-xs">
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || triggerFilter !== "all" || ruleFilter !== "all" || windowChoice !== "7d") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => {
              setWindowChoice("7d")
              setStatusFilter("all")
              setTriggerFilter("all")
              setRuleFilter("all")
              setPage(0)
            }}
          >
            Reset
          </Button>
        )}
      </div>

      {/* Log table */}
      <div className="bg-background border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-8" />
              <TableHead className="text-xs">Time</TableHead>
              <TableHead className="text-xs">Rule</TableHead>
              <TableHead className="text-xs">Trigger</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs text-right">Actions run</TableHead>
              <TableHead className="text-xs text-right">Recipients</TableHead>
              <TableHead className="text-xs text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && executions.length === 0 ? (
              [...Array(6)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton className="h-5 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : executions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-xs text-muted-foreground">
                  No executions match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              executions.map((row) => {
                const isOpen = expanded.has(row.id)
                const details = Array.isArray(row.details) ? row.details : []
                return (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => toggleExpanded(row.id)}
                    >
                      <TableCell className="py-2">
                        {isOpen ? (
                          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </TableCell>
                      <TableCell className="py-2 text-xs whitespace-nowrap">
                        <div>{format(new Date(row.startedAt), "MMM d, h:mm:ss a")}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(row.startedAt), { addSuffix: true })}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 text-xs">
                        <div className="font-medium">{row.rule?.name || "(deleted rule)"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.rule?.moduleName || ""}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">{triggerBadge(row.trigger)}</TableCell>
                      <TableCell className="py-2">{statusBadge(row.status)}</TableCell>
                      <TableCell className="py-2 text-xs text-right tabular-nums">
                        {row.actionsRun}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right tabular-nums">
                        {row.recipientCount ?? "—"}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right tabular-nums">
                        {fmtMs(row.durationMs)}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow key={`${row.id}-detail`} className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={7} className="py-3">
                          {row.error && (
                            <div className="mb-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                              <span className="font-medium">Error:</span> {row.error}
                            </div>
                          )}
                          {details.length === 0 ? (
                            <p className="text-xs text-muted-foreground italic">
                              No per-action details recorded.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              <p className="text-[11px] font-medium text-foreground">Per-action results</p>
                              <div className="grid gap-1.5">
                                {details.map((d: any, i: number) => (
                                  <div
                                    key={i}
                                    className={`flex items-start gap-2 px-2 py-1.5 rounded border text-xs ${
                                      d.ok
                                        ? "bg-emerald-50 border-emerald-200"
                                        : "bg-red-50 border-red-200"
                                    }`}
                                  >
                                    {d.ok ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                                    ) : (
                                      <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium">{d.type}</div>
                                      {d.error && (
                                        <div className="text-red-700 break-words">{d.error}</div>
                                      )}
                                      {d.detail && (
                                        <div className="text-[10px] text-muted-foreground font-mono break-all">
                                          {typeof d.detail === "object"
                                            ? JSON.stringify(d.detail)
                                            : String(d.detail)}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-3 py-2 border-t bg-muted/20 text-xs">
            <span className="text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={(page + 1) * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
