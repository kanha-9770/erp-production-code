"use client";

/**
 * My Attendance — workspace-style list page.
 *
 * Mirrors the Employee Master layout: a sticky workspace header (icon +
 * title + record count + search + actions), a filter-chip row for status
 * and quick date ranges, and an Excel-like DataTable with the shared
 * row-number gutter, pinned columns, and sort/resize/copy behaviour.
 *
 * Data flow stays client-side — /api/attendance/history is fetched on
 * mount and whenever the date range changes; status / search filtering
 * runs in memory so the chips feel instant.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CalendarClock, Clock, Search, RefreshCcw, Loader2, AlertTriangle,
  Edit3, MapPin, MoreHorizontal, Check, Info,
} from "lucide-react";
import Link from "next/link";
import { AttendanceRecordDetail, type AttendanceRecord } from "./attendance-record-detail";
import { RegularizationDialog } from "./regularization-dialog";
import {
  formatHM, formatTimeShort, shiftDays, todayIso, workedMinutesFor,
} from "./attendance-format";
import { useUserTimezone } from "@/lib/user-timezone";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  ActiveFilterPills,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";

interface HistoryResponse {
  success: boolean;
  from: string;
  to: string;
  summary: {
    presentDays: number;
    lateDays: number;
    totalWorkedMinutes: number;
    totalOvertimeMinutes: number;
  };
  faceVerify?: { mode: string; threshold: number };
  records: AttendanceRecord[];
  error?: string;
}

// Status options for the chip filter — same set the records table maps
// to badges, plus "Working" for live in-progress punches.
const STATUS_OPTIONS = [
  { value: "PRESENT",       label: "Present" },
  { value: "WORKING",       label: "Working" },
  { value: "HALF_DAY",      label: "Half Day" },
  { value: "AUTO_CHECKOUT", label: "Auto Checkout" },
  { value: "ABSENT",        label: "Absent" },
  { value: "ON_LEAVE",    label: "On Leave" },
  { value: "HOLIDAY",     label: "Holiday" },
  { value: "WEEKLY_OFF",  label: "Weekly Off" },
  { value: "REGULARIZED", label: "Regularized" },
];

const STATUS_BADGE: Record<string, string> = {
  PRESENT:       "bg-emerald-100 text-emerald-800 border-emerald-200",
  WORKING:       "bg-emerald-100 text-emerald-800 border-emerald-200",
  HALF_DAY:      "bg-amber-100 text-amber-800 border-amber-200",
  AUTO_CHECKOUT: "bg-red-100 text-red-700 border-red-200",
  ABSENT:        "bg-red-100 text-red-700 border-red-200",
  ON_LEAVE:      "bg-blue-100 text-blue-800 border-blue-200",
  HOLIDAY:       "bg-purple-100 text-purple-800 border-purple-200",
  WEEKLY_OFF:    "bg-slate-100 text-slate-700 border-slate-200",
  REGULARIZED:   "bg-indigo-100 text-indigo-800 border-indigo-200",
};

// Resolve a row's effective status string (matching the chip values).
// Prefer the server-computed `effectiveStatus` — it already accounts for
// org thresholds (halfDayMinHours / fullDayMinHours from Attendance
// Configuration), per-employee shift (via lateMinutes), and auto-
// checkout. The legacy derivation stays for records without the field
// (e.g. cached responses from an older API).
function effectiveStatus(record: AttendanceRecord): string {
  if (record.effectiveStatus) return record.effectiveStatus;
  if (record.checkedIn && !record.checkedOut) return "WORKING";
  if (record.isAutoCheckedOut) return "AUTO_CHECKOUT";
  if (record.checkedOut && (record.lateMinutes ?? 0) > 0) return "HALF_DAY";
  const s = (record.status ?? "").toUpperCase();
  if (s === "HALF") return "HALF_DAY";
  if (s) return s;
  return record.checkedOut ? "PRESENT" : "ABSENT";
}

function statusLabel(code: string): string {
  return STATUS_OPTIONS.find((o) => o.value === code)?.label ?? code;
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
}

export function MyAttendance() {
  // Subscribe so check-in / check-out cells re-render when the user
  // changes timezone in Profile → Preferences. Without this, the cells
  // would still show the ISO converted via the *previous* zone until
  // the next mount.
  useUserTimezone();
  const today = useMemo(() => todayIso(), []);
  const [from, setFrom] = useState<string>(() => shiftDays(today, -29));
  const [to, setTo] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [regularizing, setRegularizing] = useState<AttendanceRecord | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = `/api/attendance/history?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      const json = (await res.json()) as HistoryResponse;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load attendance history");
      }
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load attendance history");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // In-memory filtering — date range is already applied server-side.
  // Status chip + free-text search run here so the chip clicks feel
  // instant without a refetch.
  const rows = useMemo(() => {
    const records = data?.records ?? [];
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (statusFilter) {
        if (effectiveStatus(r) !== statusFilter) return false;
      }
      if (q) {
        const hay = [
          r.date,
          fmtShortDate(r.date),
          r.status ?? "",
          r.checkInTime ?? "",
          r.checkOutTime ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusFilter, search]);

  const summary = data?.summary;
  const total = data?.records.length ?? 0;
  const filtered = rows.length;

  const columns: ColumnDef<AttendanceRecord>[] = useMemo(
    () => [
      {
        id: "date",
        header: "Date",
        width: 200,
        pinned: true,
        sortKey: "date",
        copyValue: (r) => fmtShortDate(r.date),
        cell: (r) => (
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
              <CalendarClock className="h-4 w-4 text-primary/70" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{fmtShortDate(r.date)}</div>
              <div className="text-[11px] text-muted-foreground">
                {workedMinutesFor(r) > 0
                  ? `Worked ${formatHM(workedMinutesFor(r))}`
                  : "—"}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        minWidth: 110,
        sortKey: "status",
        cell: (r) => {
          const code = effectiveStatus(r);
          // Prefer the server-supplied reason (it knows the exact hours
          // worked and the configured thresholds). Fall back to the
          // generic explanations for older records where the API didn't
          // ship `effectiveStatusReason`.
          const reason =
            r.effectiveStatusReason ??
            (code === "AUTO_CHECKOUT"
              ? "You forgot to check out — the system closed this day at the cutoff. This day's salary is ₹0."
              : code === "HALF_DAY" && (r.lateMinutes ?? 0) > 0
                ? `Late check-in by ${r.lateMinutes}m past grace — counted as half-day.`
                : null);
          const badge = (
            <Badge
              variant="outline"
              className={`text-[10px] whitespace-nowrap ${STATUS_BADGE[code] ?? ""}`}
            >
              {statusLabel(code).toUpperCase()}
            </Badge>
          );
          if (!reason) return badge;
          // Pair the badge with a small info icon so the tooltip is
          // discoverable. The HoverCard opens on hover (desktop) and on
          // tap (mobile), and we stop propagation so clicking the icon
          // doesn't accidentally open the row detail panel underneath.
          return (
            <HoverCard openDelay={100} closeDelay={100}>
              <HoverCardTrigger
                asChild
                onClick={(e) => e.stopPropagation()}
              >
                <span className="inline-flex items-center gap-1 cursor-help">
                  {badge}
                  <Info className="h-3 w-3 text-muted-foreground" />
                </span>
              </HoverCardTrigger>
              <HoverCardContent
                side="bottom"
                align="start"
                className="text-xs w-64 p-3 leading-snug"
              >
                {reason}
              </HoverCardContent>
            </HoverCard>
          );
        },
      },
      {
        id: "checkIn",
        header: "Check-in",
        width: 130,
        sortKey: "checkInAt",
        // Prefer the ISO `checkInAt` so the cell renders in the user's
        // chosen timezone — the legacy `checkInTime` HH:mm string is in
        // server-local time (UTC in prod), which made My Attendance
        // disagree with Team Attendance for the same row.
        copyValue: (r) => r.checkInAt ? formatTimeShort(r.checkInAt) : (r.checkInTime ?? ""),
        cell: (r) => (
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-mono">{r.checkInAt ? formatTimeShort(r.checkInAt) : (r.checkInTime ?? "—")}</span>
            {r.lateMinutes > 0 && (
              <span className="text-[10px] text-amber-700 font-semibold">
                +{r.lateMinutes}m
              </span>
            )}
          </div>
        ),
      },
      {
        id: "checkOut",
        header: "Check-out",
        width: 130,
        sortKey: "checkOutAt",
        copyValue: (r) => r.checkOutAt ? formatTimeShort(r.checkOutAt) : (r.checkOutTime ?? ""),
        cell: (r) => (
          <div className="flex items-center gap-1.5 text-sm">
            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="font-mono">{r.checkOutAt ? formatTimeShort(r.checkOutAt) : (r.checkOutTime ?? "—")}</span>
            {r.earlyOutMinutes > 0 && (
              <span className="text-[10px] text-amber-700 font-semibold">
                -{r.earlyOutMinutes}m
              </span>
            )}
          </div>
        ),
      },
      {
        id: "worked",
        header: "Worked",
        width: 110,
        align: "right",
        copyValue: (r) => formatHM(workedMinutesFor(r)),
        cell: (r) => (
          <span className="font-mono text-sm tabular-nums">
            {workedMinutesFor(r) > 0 ? formatHM(workedMinutesFor(r)) : "—"}
          </span>
        ),
      },
      {
        id: "overtime",
        header: "Overtime",
        width: 110,
        align: "right",
        defaultHidden: false,
        copyValue: (r) => formatHM(r.overtimeMinutes),
        cell: (r) => (
          <span
            className={`font-mono text-sm tabular-nums ${
              r.overtimeMinutes > 0 ? "text-blue-700 font-semibold" : ""
            }`}
          >
            {r.overtimeMinutes > 0 ? formatHM(r.overtimeMinutes) : "—"}
          </span>
        ),
      },
      {
        id: "late",
        header: "Late",
        width: 90,
        align: "right",
        defaultHidden: true,
        copyValue: (r) => (r.lateMinutes > 0 ? `${r.lateMinutes}m` : ""),
        cell: (r) => (
          <span className="font-mono text-sm tabular-nums">
            {r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}
          </span>
        ),
      },
      {
        id: "location",
        header: "Location",
        width: 90,
        defaultHidden: true,
        cell: (r) =>
          r.checkInLat != null || r.checkOutLat != null ? (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        width: 56,
        cell: (r) => (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            title="Request correction"
            onClick={(e) => {
              e.stopPropagation();
              setRegularizing(r);
            }}
          >
            <Edit3 className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [],
  );

  const activePills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (statusFilter) {
      pills.push({
        key: "status",
        label: <>Status: <strong>{statusLabel(statusFilter)}</strong></>,
      });
    }
    if (search) {
      pills.push({
        key: "search",
        label: <>Search: <strong>{search}</strong></>,
      });
    }
    return pills;
  }, [statusFilter, search]);

  const subtitle = useMemo(() => {
    if (loading && !data) return "loading…";
    if (!summary) return `${total} record${total === 1 ? "" : "s"}`;
    const parts = [
      `${total} record${total === 1 ? "" : "s"}`,
      `${summary.presentDays} present`,
    ];
    if (summary.lateDays > 0) parts.push(`${summary.lateDays} late`);
    if (summary.totalWorkedMinutes > 0) {
      parts.push(`${formatHM(summary.totalWorkedMinutes)} worked`);
    }
    if (summary.totalOvertimeMinutes > 0) {
      parts.push(`${formatHM(summary.totalOvertimeMinutes)} OT`);
    }
    if (filtered !== total) parts.push(`(${filtered} shown)`);
    return parts.join(" · ");
  }, [loading, data, summary, total, filtered]);

  return (
    <>
      <WorkspaceShell
        scope="attendance"
        selectedId={null}
        onCloseSelection={() => {}}
        header={
          <>
            <WorkspaceHeader
              icon={<CalendarClock className="h-5 w-5" />}
              title="My Attendance"
              subtitle={subtitle}
            >
              {/* Row 1 on mobile: search (grows) + Columns + Refresh icons.
                  All three share one row so the header doesn't sprawl. */}
              <div className="flex items-center gap-2 w-full sm:contents order-first sm:order-none">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search date or status…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8 h-8 w-full sm:w-56 text-sm"
                  />
                </div>
                <ManageColumnsButton
                  tableId="my-attendance"
                  columns={columns}
                  variant="dialog"
                />
                <Button
                  size="sm"
                  className="h-8 px-2 sm:px-3 shrink-0"
                  onClick={fetchHistory}
                  disabled={loading}
                  title="Refresh"
                >
                  {loading ? (
                    <Loader2 className="h-3.5 w-3.5 sm:mr-1 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-3.5 w-3.5 sm:mr-1" />
                  )}
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </div>
              {/* Row 2 on mobile: From + To inputs side-by-side, full width. */}
              <div className="flex items-center gap-2 w-full sm:contents">
                <Input
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 flex-1 min-w-0 sm:flex-none sm:w-36 text-xs"
                  aria-label="From date"
                />
                <Input
                  type="date"
                  value={to}
                  min={from}
                  max={today}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 flex-1 min-w-0 sm:flex-none sm:w-36 text-xs"
                  aria-label="To date"
                />
              </div>
            </WorkspaceHeader>

            {/* Filter chip row — single line on mobile too. Shows All +
                first 2 statuses + a "…" popover with the rest, plus the
                quick-range buttons on the right. */}
            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-2">
              <StatusFilter
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
              />
              <div className="flex flex-nowrap gap-1.5 ml-auto">
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setTo(today);
                    setFrom(shiftDays(today, -6));
                  }}
                >
                  7d
                </Button>
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setTo(today);
                    setFrom(shiftDays(today, -14));
                  }}
                >
                  15d
                </Button>
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    const start = today.slice(0, 7) + "-01";
                    setFrom(start);
                    setTo(today);
                  }}
                >
                  Month
                </Button>
                <Button
                  variant="outline"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    setTo(today);
                    setFrom(shiftDays(today, -364));
                  }}
                >
                  Year
                </Button>
              </div>
              {(activePills.length > 0) && (
                <div className="w-full">
                  <ActiveFilterPills
                    filters={activePills}
                    onClear={(k) => {
                      if (k === "status") setStatusFilter("");
                      if (k === "search") setSearch("");
                    }}
                    onClearAll={() => {
                      setStatusFilter("");
                      setSearch("");
                    }}
                  />
                </div>
              )}
              <Link
                href="/attendance/regularizations"
                className="w-full sm:w-auto text-xs text-blue-700 hover:underline shrink-0"
              >
                My regularization requests →
              </Link>
            </div>
          </>
        }
        list={
          <div className="flex flex-col h-full">
            {error && (
              <div className="mx-4 mt-3 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <DataTable<AttendanceRecord>
                tableId="my-attendance"
                columns={columns}
                rows={rows}
                rowId={(r) => r.id}
                isLoading={loading && !data}
                selectedId={null}
                onRowClick={(r) => setSelected(r)}
                emptyState={
                  <div className="py-20 text-center">
                    <CalendarClock className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground">
                      {statusFilter || search
                        ? "No records match these filters."
                        : "No attendance records for this range."}
                    </p>
                  </div>
                }
              />
            </div>
          </div>
        }
        preview={null}
      />

      <AttendanceRecordDetail
        record={
          selected
            ? {
                ...selected,
                faceMatchThreshold: data?.faceVerify?.threshold ?? null,
              }
            : null
        }
        onClose={() => setSelected(null)}
      />
      <RegularizationDialog
        open={!!regularizing}
        onOpenChange={(o) => !o && setRegularizing(null)}
        record={regularizing}
        onSuccess={fetchHistory}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline status filter — shows All + the first 2 status options as chips,
// and tucks the remaining 6 behind a "…" popover so the chip row never
// wraps onto a second line. The active selection always appears as a
// visible chip even if it lives in the overflow set, so users always see
// what's currently filtered.
// ─────────────────────────────────────────────────────────────────────────────

interface StatusFilterProps {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

function StatusFilter({ value, onChange, options }: StatusFilterProps) {
  const VISIBLE_LIMIT = 2;
  const [overflowOpen, setOverflowOpen] = useState(false);

  // Always-visible options (the first N). If the active selection is in
  // the overflow set, promote it into the visible row so the chip
  // representing the current filter is never hidden behind the "…".
  const baseVisible = options.slice(0, VISIBLE_LIMIT);
  const overflow = options.slice(VISIBLE_LIMIT);
  const activeOverflow = overflow.find((o) => o.value === value) ?? null;
  const visibleOptions = activeOverflow
    ? [...baseVisible.slice(0, VISIBLE_LIMIT - 1), activeOverflow]
    : baseVisible;
  const overflowOptions = overflow.filter(
    (o) => !visibleOptions.some((v) => v.value === o.value),
  );

  return (
    <div className="flex flex-nowrap items-center gap-1.5">
      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mr-0.5">
        Status
      </span>
      <StatusChip active={value === ""} onClick={() => onChange("")}>
        All
      </StatusChip>
      {visibleOptions.map((o) => (
        <StatusChip
          key={o.value}
          active={value === o.value}
          onClick={() => onChange(value === o.value ? "" : o.value)}
        >
          {o.label}
        </StatusChip>
      ))}
      {overflowOptions.length > 0 && (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center justify-center h-7 w-7 rounded-full border bg-background hover:bg-muted transition-colors shrink-0"
              aria-label="More status options"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-44 p-1" sideOffset={4}>
            <ul className="space-y-0.5">
              {overflowOptions.map((o) => {
                const active = value === o.value;
                return (
                  <li key={o.value}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(active ? "" : o.value);
                        setOverflowOpen(false);
                      }}
                      className={cn(
                        "w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left transition-colors",
                        active
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-muted",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5",
                          active ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {o.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function StatusChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center h-7 px-2.5 rounded-full border text-xs whitespace-nowrap transition-colors shrink-0",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
