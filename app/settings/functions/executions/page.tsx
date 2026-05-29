"use client"

/**
 * Admin page: Function execution history.
 *
 * Twin of /settings/workflow-rules/executions — same layout, same filter
 * vocabulary, but scoped to FunctionExecution rows. Each row expands to show
 * (1) the input passed in, (2) the script's return value, (3) every console
 * line captured during the run with level-coded colours.
 *
 * Filters mirror the workflow page so muscle-memory carries over: time
 * window, status, trigger source, function. URL-synced for shareable links.
 */

import { Fragment, useEffect, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { format, formatDistanceToNow, subDays, startOfDay } from "date-fns"
import { Button } from "@/components/ui/button"
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
  Filter,
  Code2,
} from "lucide-react"
import {
  useGetFunctionExecutionsQuery,
  useGetFunctionsQuery,
} from "@/lib/api/functions"

type Status = "all" | "success" | "failed"
type Trigger = "all" | "manual" | "test" | "workflow" | "scheduled" | "binding" | "rest-api"
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
    case "failed":
      return <Badge className={`${base} bg-red-100 text-red-700 hover:bg-red-100`}>failed</Badge>
    default:
      return <Badge className={`${base} bg-slate-100 text-slate-600 hover:bg-slate-100`}>{status}</Badge>
  }
}

function triggerBadge(trigger: string) {
  const base = "text-[10px] px-1.5 py-0 font-medium border"
  const color: Record<string, string> = {
    workflow: "border-indigo-200 text-indigo-700",
    scheduled: "border-purple-200 text-purple-700",
    test: "border-blue-200 text-blue-700",
    manual: "border-blue-200 text-blue-700",
    binding: "border-emerald-200 text-emerald-700",
    "rest-api": "border-amber-200 text-amber-700",
  }
  return (
    <Badge variant="outline" className={`${base} ${color[trigger] || ""}`}>
      {trigger}
    </Badge>
  )
}

function fmtMs(ms: number | null) {
  if (ms == null) return "—"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 1000)}s`
}

function logLevelClass(level: string): string {
  switch (level) {
    case "error": return "bg-red-50 text-red-700"
    case "warn": return "bg-amber-50 text-amber-700"
    case "info": return "bg-blue-50 text-blue-700"
    default: return "bg-muted/30 text-foreground"
  }
}

export default function FunctionExecutionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [windowChoice, setWindowChoice] = useState<WindowChoice>(
    (searchParams.get("window") as WindowChoice) || "7d",
  )
  const [statusFilter, setStatusFilter] = useState<Status>(
    (searchParams.get("status") as Status) || "all",
  )
  const [triggerFilter, setTriggerFilter] = useState<Trigger>(
    (searchParams.get("trigger") as Trigger) || "all",
  )
  const [functionFilter, setFunctionFilter] = useState<string>(searchParams.get("functionId") || "all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 50

  // URL sync.
  useEffect(() => {
    const sp = new URLSearchParams()
    if (windowChoice !== "7d") sp.set("window", windowChoice)
    if (statusFilter !== "all") sp.set("status", statusFilter)
    if (triggerFilter !== "all") sp.set("trigger", triggerFilter)
    if (functionFilter !== "all") sp.set("functionId", functionFilter)
    const qs = sp.toString()
    router.replace(qs ? `/settings/functions/executions?${qs}` : "/settings/functions/executions", {
      scroll: false,
    })
  }, [windowChoice, statusFilter, triggerFilter, functionFilter, router])

  const since = useMemo(
    () => startOfDay(subDays(new Date(), WINDOW_DAYS[windowChoice])).toISOString(),
    [windowChoice],
  )

  const queryParams = useMemo(
    () => ({
      since,
      status: statusFilter === "all" ? undefined : statusFilter,
      trigger: triggerFilter === "all" ? undefined : triggerFilter,
      functionId: functionFilter === "all" ? undefined : functionFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [since, statusFilter, triggerFilter, functionFilter, page],
  )

  const { data, isLoading, isFetching, refetch } = useGetFunctionExecutionsQuery(queryParams)
  const { data: functionsData } = useGetFunctionsQuery()

  const executions = data?.data || []
  const summary = data?.summary
  const total = data?.pagination?.total ?? 0

  const successPct = useMemo(() => {
    if (!summary || summary.total === 0) return 0
    const ok = summary.byStatus.success || 0
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
            onClick={() => router.push("/settings/functions")}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to functions
          </Button>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Code2 className="h-5 w-5 text-indigo-700" />
            Function Execution Log
          </h1>
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
            <CardTitle className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-7 w-16" /> : `${successPct}%`}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground">
              {summary?.byStatus?.failed || 0} failure(s) in window
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px]">Avg duration</CardDescription>
            <CardTitle className="text-2xl font-semibold">
              {isLoading ? <Skeleton className="h-7 w-16" /> : fmtMs(summary?.avgDurationMs ?? 0)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[11px] text-muted-foreground">
              Total: {fmtMs(summary?.totalDurationMs ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="text-[11px]">Triggered by</CardDescription>
            <CardTitle className="text-base font-semibold flex flex-wrap gap-1.5 pt-1">
              {isLoading ? (
                <Skeleton className="h-5 w-32" />
              ) : (
                <>
                  {Object.entries(summary?.byTrigger || {}).map(([k, v]) => (
                    <span key={k} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{v}</span> {k}
                    </span>
                  ))}
                  {!summary?.total && (
                    <span className="text-xs text-muted-foreground">No runs yet</span>
                  )}
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0" />
        </Card>
      </div>

      {/* Filters */}
      <div className="bg-background border rounded-md p-3 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground mr-1">Filters:</span>

        <Select value={windowChoice} onValueChange={(v) => { setWindowChoice(v as WindowChoice); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="1d" className="text-xs">Last 24 hours</SelectItem>
            <SelectItem value="7d" className="text-xs">Last 7 days</SelectItem>
            <SelectItem value="30d" className="text-xs">Last 30 days</SelectItem>
            <SelectItem value="90d" className="text-xs">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as Status); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All statuses</SelectItem>
            <SelectItem value="success" className="text-xs">Success</SelectItem>
            <SelectItem value="failed" className="text-xs">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={triggerFilter} onValueChange={(v) => { setTriggerFilter(v as Trigger); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All triggers</SelectItem>
            <SelectItem value="test" className="text-xs">Test (manual)</SelectItem>
            <SelectItem value="workflow" className="text-xs">Workflow rule</SelectItem>
            <SelectItem value="scheduled" className="text-xs">Scheduled</SelectItem>
            <SelectItem value="binding" className="text-xs">Form binding</SelectItem>
            <SelectItem value="rest-api" className="text-xs">REST API</SelectItem>
            <SelectItem value="manual" className="text-xs">Manual</SelectItem>
          </SelectContent>
        </Select>

        <Select value={functionFilter} onValueChange={(v) => { setFunctionFilter(v); setPage(0) }}>
          <SelectTrigger className="h-8 text-xs w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All functions</SelectItem>
            {(functionsData?.data || []).map((f: any) => (
              <SelectItem key={f.id} value={f.id} className="text-xs">
                {f.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== "all" || triggerFilter !== "all" || functionFilter !== "all" || windowChoice !== "7d") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs ml-auto"
            onClick={() => {
              setWindowChoice("7d")
              setStatusFilter("all")
              setTriggerFilter("all")
              setFunctionFilter("all")
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
              <TableHead className="text-xs">Function</TableHead>
              <TableHead className="text-xs">Trigger</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Actor</TableHead>
              <TableHead className="text-xs text-right">Duration</TableHead>
              <TableHead className="text-xs text-right">Logs</TableHead>
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
                  No function executions match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              executions.map((row) => {
                const isOpen = expanded.has(row.id)
                const logs = Array.isArray(row.logs) ? row.logs : []
                const actor = row.user
                  ? [row.user.first_name, row.user.last_name].filter(Boolean).join(" ") || row.user.email
                  : "(system)"
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
                        <div className="font-medium">{row.function?.displayName || "(deleted)"}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {row.function?.category || ""}
                        </div>
                      </TableCell>
                      <TableCell className="py-2">{triggerBadge(row.trigger)}</TableCell>
                      <TableCell className="py-2">{statusBadge(row.status)}</TableCell>
                      <TableCell className="py-2 text-xs truncate max-w-[160px]" title={actor}>
                        {actor}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right tabular-nums">
                        {fmtMs(row.durationMs)}
                      </TableCell>
                      <TableCell className="py-2 text-xs text-right tabular-nums">
                        {logs.length}
                      </TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={7} className="py-3">
                          {row.error && (
                            <div className="mb-3 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                              <span className="font-medium">Error:</span> {row.error}
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <p className="text-[10px] font-semibold text-foreground mb-1">Input</p>
                              <pre className="text-[10px] bg-muted/40 border rounded p-2 overflow-auto max-h-40 font-mono">
                                {row.input ? JSON.stringify(row.input, null, 2) : "—"}
                              </pre>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold text-foreground mb-1">Result</p>
                              <pre className="text-[10px] bg-muted/40 border rounded p-2 overflow-auto max-h-40 font-mono">
                                {row.result !== null && row.result !== undefined
                                  ? JSON.stringify(row.result, null, 2)
                                  : "—"}
                              </pre>
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold text-foreground mb-1">
                              Console output ({logs.length})
                            </p>
                            {logs.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground italic">
                                No console.log calls captured.
                              </p>
                            ) : (
                              <div className="space-y-1 max-h-72 overflow-auto">
                                {logs.map((entry: any, i: number) => (
                                  <div
                                    key={i}
                                    className={`flex items-start gap-2 px-2 py-1 rounded text-[10px] font-mono ${logLevelClass(entry.level)}`}
                                  >
                                    <span className="text-muted-foreground shrink-0 tabular-nums">
                                      {new Date(entry.ts).toISOString().slice(11, 19)}
                                    </span>
                                    <span className="uppercase text-[9px] shrink-0 mt-px">
                                      {entry.level}
                                    </span>
                                    <span className="break-words flex-1">
                                      {(entry.args || []).map((a: any) =>
                                        typeof a === "object" ? JSON.stringify(a) : String(a),
                                      ).join(" ")}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
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
