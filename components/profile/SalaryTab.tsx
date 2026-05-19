"use client"

/**
 * SalaryTab — read-only history of the signed-in user's own monthly salary
 * (payroll) records. Even non-admin employees can see their own pay history
 * here; admin-wide views live under /payroll.
 */

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  Banknote,
  TrendingUp,
  TrendingDown,
  CalendarDays,
  ReceiptText,
  CheckCircle2,
  Clock3,
  AlertCircle,
  Wallet,
  ChevronDown,
  ChevronUp,
} from "lucide-react"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { ProfileUser } from "./types"

interface SalaryRecord {
  id: string
  month: number
  year: number
  presentDays: number
  leaveDays: number
  halfDays: number
  shortLeaves: number
  overtimeHours: number
  baseSalary: number
  grossSalary: number
  deductions: number
  netSalary: number
  allowances: unknown
  deductionDetail: unknown
  status: string
  processedAt: string | null
  paidAt: string | null
  notes: string | null
  createdAt: string
}

interface SalaryResponse {
  success: boolean
  records: SalaryRecord[]
  employee: {
    id: string
    name: string
    totalSalary: number
    givenSalary: number
    dateOfJoining: string | null
  } | null
  reason?: string
  error?: string
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

export default function SalaryTab({ user }: { user: ProfileUser }) {
  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: SalaryResponse | null
  }>({ loading: true, error: null, data: null })

  useEffect(() => {
    let cancelled = false
    fetch("/api/profile/salary", {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (r) => {
        const j = (await r.json()) as SalaryResponse
        if (cancelled) return
        if (!j.success) {
          setState({ loading: false, error: j.error ?? "Failed to load", data: null })
          return
        }
        setState({ loading: false, error: null, data: j })
      })
      .catch((e: Error) => {
        if (cancelled) return
        setState({ loading: false, error: e.message, data: null })
      })
    return () => {
      cancelled = true
    }
  }, [])

  const records = state.data?.records ?? []
  const noEmployee = state.data?.reason === "no-employee-record"

  const years = useMemo(
    () => Array.from(new Set(records.map((r) => r.year))).sort((a, b) => b - a),
    [records]
  )

  const latestRecord = useMemo(() => {
    if (records.length === 0) return null;
    return records.reduce((latest, current) => {
      const latestVal = latest.year * 12 + latest.month;
      const currentVal = current.year * 12 + current.month;
      return currentVal > latestVal ? current : latest;
    });
  }, [records])

  const [selectedYear, setSelectedYear] = useState<string>("")
  const [selectedMonth, setSelectedMonth] = useState<string>("")

  // Set default to latest month
  useEffect(() => {
    if (latestRecord && !selectedYear && !selectedMonth) {
      setSelectedYear(latestRecord.year.toString())
      setSelectedMonth(latestRecord.month.toString())
    }
  }, [latestRecord, selectedYear, selectedMonth])

  const filteredRecords = useMemo(() => {
    let res = records
    const y = selectedYear || latestRecord?.year.toString()
    const m = selectedMonth || latestRecord?.month.toString()
    
    if (y && y !== "all") {
      res = res.filter(r => r.year.toString() === y)
    }
    if (y !== "all" && m && m !== "all") {
      res = res.filter(r => r.month.toString() === m)
    }
    return res
  }, [records, selectedYear, selectedMonth, latestRecord])

  const availableMonthsForYear = useMemo(() => {
    const y = selectedYear || latestRecord?.year.toString()
    if (!y || y === "all") return []
    const monthsInYear = records.filter(r => r.year.toString() === y).map(r => r.month)
    return Array.from(new Set(monthsInYear)).sort((a, b) => a - b)
  }, [records, selectedYear, latestRecord])

  const periodLabel = useMemo(() => {
    const y = selectedYear || latestRecord?.year.toString()
    const m = selectedMonth || latestRecord?.month.toString()
    if (!y || y === "all") return ""
    if (m && m !== "all") {
      return `in ${MONTHS[Number(m) - 1]} ${y}`
    }
    return `in ${y}`
  }, [selectedYear, selectedMonth, latestRecord])

  const contractMonthly = state.data?.employee?.totalSalary ?? 0

  const summary = useMemo(() => {
    const total = filteredRecords.reduce((s, r) => s + r.netSalary, 0)
    const totalGross = filteredRecords.reduce((s, r) => s + r.grossSalary, 0)
    const totalDeductions = filteredRecords.reduce((s, r) => s + r.deductions, 0)
    const paidCount = filteredRecords.filter((r) => r.status === "paid").length
    const totalLoss = filteredRecords.reduce((s, r) => {
      const allowances = r.allowances as any
      const ot = Number(allowances?.earnings?.overtime || 0)
      // Cap the expected base by the current contract monthly so loss-of-pay
      // can't read higher than what the employee is contracted to earn.
      // Discrepancies happen when Employee.totalSalary was edited after the
      // payroll record was generated.
      const expectedBase =
        contractMonthly > 0 && contractMonthly < r.baseSalary
          ? contractMonthly
          : r.baseSalary
      return s + Math.max(0, expectedBase - (r.grossSalary - ot))
    }, 0)
    return { total, totalGross, totalDeductions, paidCount, totalLoss }
  }, [filteredRecords, contractMonthly])

  const chartData = useMemo(() => {
    // Reverse so chronological order (assuming records are descending)
    return [...filteredRecords].reverse().map((r) => {
      const allowances = r.allowances as any
      const ot = Number(allowances?.earnings?.overtime || 0)
      const loss = Math.max(0, r.baseSalary - (r.grossSalary - ot))
      return {
        name: `${MONTHS[r.month - 1]?.substring(0, 3)} '${r.year.toString().slice(-2)}`,
        lossAmount: loss,
        month: r.month,
        year: r.year,
      }
    })
  }, [filteredRecords])

  // Currency formatter — INR is the default since the underlying ERP is
  // India-oriented. We pull symbol from organization preferences via a
  // server roundtrip in the wider app; this tab keeps it simple.
  const fmt = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }),
    [],
  )

  // Compact INR (Lakh / Crore) — used on small screens so stat tiles don't
  // overflow when the underlying number runs to 6+ digits.
  const fmtShort = useMemo(
    () => (n: number) => {
      const abs = Math.abs(n)
      const sign = n < 0 ? "-" : ""
      if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(abs % 1_00_00_000 === 0 ? 0 : 2)}Cr`
      if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(abs % 1_00_000 === 0 ? 0 : 2)}L`
      if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1)}K`
      return `${sign}₹${abs}`
    },
    [],
  )

  if (state.loading) {
    return <LoadingShell />
  }

  if (state.error) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-center gap-2">
          <AlertCircle className="h-6 w-6 text-rose-500" />
          <p className="text-sm font-medium">Couldn't load salary records</p>
          <p className="text-xs text-muted-foreground">{state.error}</p>
        </CardContent>
      </Card>
    )
  }

  if (noEmployee) {
    return (
      <Card>
        <CardContent className="py-10 flex flex-col items-center text-center gap-2">
          <Wallet className="h-7 w-7 text-muted-foreground/60" />
          <p className="text-sm font-medium">No HR record linked yet</p>
          <p className="text-xs text-muted-foreground max-w-md">
            Salary history will appear here once your admin attaches your HR
            Employee record to this account.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (records.length === 0) {
    return (
      <div className="space-y-6">
        <CompensationSnapshot
          employee={state.data?.employee ?? null}
          fmt={fmt}
        />
        <Card>
          <CardContent className="py-10 flex flex-col items-center text-center gap-2">
            <ReceiptText className="h-7 w-7 text-muted-foreground/60" />
            <p className="text-sm font-medium">No payroll records yet</p>
            <p className="text-xs text-muted-foreground max-w-md">
              When your organization processes payroll, your monthly slips will
              show up here.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <CompensationSnapshot
        employee={state.data?.employee ?? null}
        fmt={fmt}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <h2 className="text-lg sm:text-xl font-bold tracking-tight">Salary Dashboard</h2>
        {years.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs sm:text-sm font-medium text-muted-foreground mr-0.5 sm:mr-1">Period:</span>
            <Select
              value={selectedYear || latestRecord?.year.toString() || "all"}
              onValueChange={(val) => {
                setSelectedYear(val)
                setSelectedMonth("all")
              }}
            >
              <SelectTrigger className="w-[100px] sm:w-[110px] h-8 sm:h-9 text-xs sm:text-sm">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Time</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={y.toString()}>
                    Year {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(selectedYear || latestRecord?.year.toString()) !== "all" && (
              <Select
                value={selectedMonth || latestRecord?.month.toString() || "all"}
                onValueChange={setSelectedMonth}
              >
                <SelectTrigger className="w-[120px] sm:w-[130px] h-8 sm:h-9 text-xs sm:text-sm">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {availableMonthsForYear.map((m) => (
                    <SelectItem key={m} value={m.toString()}>
                      {MONTHS[m - 1]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-5">
        <StatTile
          icon={<Banknote className="h-4 w-4" />}
          label="Total paid"
          value={fmt.format(summary.total)}
          valueShort={fmtShort(summary.total)}
          tone="success"
          caption={`${filteredRecords.length} record${filteredRecords.length === 1 ? "" : "s"} ${periodLabel}`}
        />
        <StatTile
          icon={<TrendingUp className="h-4 w-4" />}
          label="Total gross"
          value={fmt.format(summary.totalGross)}
          valueShort={fmtShort(summary.totalGross)}
          tone="info"
          caption="Before deductions"
        />
        <StatTile
          icon={<TrendingDown className="h-4 w-4" />}
          label="Total deductions"
          value={fmt.format(summary.totalDeductions)}
          valueShort={fmtShort(summary.totalDeductions)}
          tone="warn"
          caption="PF, tax, other"
        />
        <StatTile
          icon={<AlertCircle className="h-4 w-4" />}
          label="Loss of Pay"
          value={fmt.format(summary.totalLoss)}
          valueShort={fmtShort(summary.totalLoss)}
          tone="danger"
          caption="Due to absences"
        />
        <StatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="Slips paid"
          value={`${summary.paidCount} / ${filteredRecords.length}`}
          tone={
            summary.paidCount === filteredRecords.length && filteredRecords.length > 0
              ? "success"
              : "info"
          }
          caption="Settled by org"
        />
      </div>

      <Card>
        <CardHeader className="pb-3 px-4 sm:px-6 pt-4 sm:pt-6 flex-row items-start sm:items-center justify-between gap-2 space-y-0 border-b">
          <div className="min-w-0">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <ReceiptText className="h-4 w-4 text-primary shrink-0" />
              Salary records
            </CardTitle>
            <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 break-words">
              {(selectedYear || latestRecord?.year.toString()) === "all"
                ? "All monthly payroll slips."
                : `Monthly payroll slip${filteredRecords.length === 1 ? "" : "s"} ${periodLabel}.`}
            </p>
          </div>
          <Badge
            variant="outline"
            className="text-[10px] tabular-nums shrink-0 font-mono bg-muted"
          >
            {filteredRecords.length}
          </Badge>
        </CardHeader>
        <CardContent className="p-0">
          <SalaryTable records={filteredRecords} fmt={fmt} />
        </CardContent>
      </Card>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Header showing what the employee master has on file (the contract numbers).
// ─────────────────────────────────────────────────────────────────────────────

function CompensationSnapshot({
  employee,
  fmt,
}: {
  employee: {
    id: string
    name: string
    totalSalary: number
    givenSalary: number
    dateOfJoining: string | null
  } | null
  fmt: Intl.NumberFormat
}) {
  if (!employee) return null
  const joinedOn = employee.dateOfJoining
    ? new Date(employee.dateOfJoining).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null
  return (
    <Card className="border-border/70 shadow-sm overflow-hidden bg-card">
      <div
        aria-hidden
        className="h-1.5 w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
      />
      <CardContent className="p-4 sm:p-5 md:p-6">
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4 sm:gap-5 sm:items-start">
          <div className="flex-1 min-w-0 sm:min-w-[220px] space-y-1">
            <div className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Compensation on file
            </div>
            <div className="text-base sm:text-lg font-semibold tracking-tight text-foreground break-words">
              {employee.name}
            </div>
            <p className="text-xs text-muted-foreground">
              {joinedOn
                ? `Stats below cover payroll from your joining date — ${joinedOn}.`
                : "Contract figures from your HR Employee record."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2.5 sm:gap-4 w-full sm:w-auto sm:min-w-[280px]">
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Total salary
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums tracking-tight mt-0.5 text-foreground break-words">
                {fmt.format(employee.totalSalary)}
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 px-3 py-2.5 sm:px-4 sm:py-3 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Given salary
              </div>
              <div className="text-base sm:text-lg font-bold tabular-nums tracking-tight mt-0.5 text-foreground break-words">
                {fmt.format(employee.givenSalary)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI tile (same visual language as OverviewTab's KpiGrid).
// ─────────────────────────────────────────────────────────────────────────────

type ToneKey = "success" | "warn" | "danger" | "info"

const TONE_RING: Record<ToneKey, string> = {
  success: "ring-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warn: "ring-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  danger: "ring-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  info: "ring-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400",
}

const TONE_TEXT: Record<ToneKey, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  danger: "text-rose-600 dark:text-rose-400",
  info: "text-blue-600 dark:text-blue-400",
}

function StatTile({
  icon,
  label,
  value,
  valueShort,
  tone,
  caption,
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueShort?: string
  tone: ToneKey
  caption: string
}) {
  return (
    <Card className="border-border/50 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
      <CardContent className="p-3 sm:p-4 lg:p-5 relative z-10">
        <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3 lg:mb-4">
          <span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.06em] sm:tracking-[0.08em] text-muted-foreground leading-tight">
            {label}
          </span>
          <span
            className={cn(
              "h-7 w-7 sm:h-8 sm:w-8 lg:h-9 lg:w-9 rounded-lg sm:rounded-xl flex items-center justify-center ring-1 shadow-sm shrink-0",
              TONE_RING[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        </div>
        <div
          className={cn(
            "text-xl sm:text-2xl lg:text-3xl font-bold tabular-nums tracking-tight leading-tight mb-1 break-words",
            TONE_TEXT[tone],
          )}
          title={value}
        >
          {valueShort ? (
            <>
              <span className="sm:hidden">{valueShort}</span>
              <span className="hidden sm:inline">{value}</span>
            </>
          ) : (
            value
          )}
        </div>
        <div className="text-[11px] sm:text-xs text-muted-foreground truncate">
          {caption}
        </div>
      </CardContent>
    </Card>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary table — one expandable row per month.
// ─────────────────────────────────────────────────────────────────────────────

function SalaryTable({
  records,
  fmt,
}: {
  records: SalaryRecord[]
  fmt: Intl.NumberFormat
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  return (
    <div className="divide-y">
      {/* Header row */}
      <div className="hidden md:grid grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.7fr_auto] gap-3 px-3 sm:px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
        <span>Period</span>
        <span>Days</span>
        <span>Gross</span>
        <span>Deductions</span>
        <span>Net</span>
        <span>Status</span>
        <span className="w-6" aria-hidden />
      </div>

      {records.map((r) => {
        const key = r.id
        const isOpen = !!open[key]
        return (
          <div key={key}>
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
              className="w-full grid grid-cols-[1fr_auto] md:grid-cols-[1.1fr_0.8fr_0.8fr_0.8fr_0.8fr_0.7fr_auto] gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 sm:py-3 text-sm items-center text-left hover:bg-muted/30 transition-colors"
            >
              <div className="min-w-0 flex items-center gap-2 sm:gap-2.5">
                <span className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate text-sm">
                    {MONTHS[r.month - 1] ?? r.month} {r.year}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate md:hidden flex items-center gap-1.5 mt-0.5">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                      {fmt.format(r.netSalary)}
                    </span>
                    <span aria-hidden>·</span>
                    <StatusBadge status={r.status} />
                  </div>
                </div>
              </div>

              <span className="hidden md:inline text-xs tabular-nums text-muted-foreground">
                {r.presentDays}P · {r.leaveDays}L
              </span>
              <span className="hidden md:inline text-xs tabular-nums">
                {fmt.format(r.grossSalary)}
              </span>
              <span className="hidden md:inline text-xs tabular-nums text-rose-600 dark:text-rose-400">
                −{fmt.format(r.deductions)}
              </span>
              <span className="hidden md:inline text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {fmt.format(r.netSalary)}
              </span>
              <span className="hidden md:inline">
                <StatusBadge status={r.status} />
              </span>
              <span className="text-muted-foreground shrink-0">
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            </button>

            {isOpen && <SalaryDetail record={r} fmt={fmt} />}
          </div>
        )
      })}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "pending").toLowerCase()
  const map: Record<string, { tone: string; icon: React.ReactNode }> = {
    paid: {
      tone: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle2 className="h-3 w-3 mr-0.5" />,
    },
    pending: {
      tone: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
      icon: <Clock3 className="h-3 w-3 mr-0.5" />,
    },
    processed: {
      tone: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
      icon: <CheckCircle2 className="h-3 w-3 mr-0.5" />,
    },
  }
  const entry = map[s] ?? map.pending
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] px-1.5 h-5 capitalize",
        entry.tone,
      )}
    >
      {entry.icon}
      {s}
    </Badge>
  )
}

function SalaryDetail({
  record,
  fmt,
}: {
  record: SalaryRecord
  fmt: Intl.NumberFormat
}) {
  const allowances =
    record.allowances && typeof record.allowances === "object"
      ? (record.allowances as Record<string, unknown>)
      : null
  const earnings =
    allowances && typeof allowances.earnings === "object" && allowances.earnings
      ? (allowances.earnings as Record<string, number | string>)
      : null
  const ded =
    record.deductionDetail && typeof record.deductionDetail === "object"
      ? (record.deductionDetail as Record<string, number | string>)
      : null

  return (
    <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-2 grid gap-3 sm:gap-4 sm:grid-cols-2 md:grid-cols-3 text-sm bg-muted/20 border-t">
      <DetailGroup title="Attendance">
        <DetailRow label="Present days" value={String(record.presentDays)} />
        <DetailRow label="Leave days" value={String(record.leaveDays)} />
        <DetailRow label="Half days" value={String(record.halfDays)} />
        <DetailRow label="Short leaves" value={String(record.shortLeaves)} />
        <DetailRow label="Overtime hrs" value={String(record.overtimeHours)} />
      </DetailGroup>

      <DetailGroup title="Earnings">
        <DetailRow label="Base salary" value={fmt.format(record.baseSalary)} />
        {earnings &&
          Object.entries(earnings).map(([k, v]) => (
            <DetailRow
              key={k}
              label={prettifyKey(k)}
              value={fmt.format(Number(v) || 0)}
            />
          ))}
        <DetailRow label="Gross" value={fmt.format(record.grossSalary)} bold />
      </DetailGroup>

      <DetailGroup title="Deductions & payout">
        {ded
          ? Object.entries(ded).map(([k, v]) => (
              <DetailRow
                key={k}
                label={prettifyKey(k)}
                value={`−${fmt.format(Number(v) || 0)}`}
              />
            ))
          : null}
        <DetailRow
          label="Total deductions"
          value={`−${fmt.format(record.deductions)}`}
        />
        <DetailRow label="Net pay" value={fmt.format(record.netSalary)} bold />
        {record.paidAt && (
          <DetailRow
            label="Paid on"
            value={new Date(record.paidAt).toLocaleDateString()}
          />
        )}
        {record.notes && <DetailRow label="Notes" value={record.notes} />}
      </DetailGroup>
    </div>
  )
}

function DetailGroup({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
        {title}
      </div>
      <div className="rounded-md border bg-background/60 divide-y">
        {children}
      </div>
    </div>
  )
}

function DetailRow({
  label,
  value,
  bold,
}: {
  label: string
  value: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs">
      <span className="text-muted-foreground truncate min-w-0">{label}</span>
      <span
        className={cn(
          "tabular-nums shrink-0 text-right",
          bold ? "font-semibold text-foreground" : "text-foreground/90",
        )}
      >
        {value}
      </span>
    </div>
  )
}

function prettifyKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function LoadingShell() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <Skeleton className="h-24 sm:h-28" />
      <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-20 sm:h-24" />
        ))}
      </div>
      <Skeleton className="h-56 sm:h-64" />
    </div>
  )
}
