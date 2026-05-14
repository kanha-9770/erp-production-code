"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { AttendanceRecordsTable } from "./attendance-records-table";
import { AttendanceRecordDetail, type AttendanceRecord } from "./attendance-record-detail";
import { RegularizationDialog } from "./regularization-dialog";
import { formatHM, shiftDays, todayIso } from "./attendance-format";

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
  // Sent only when face verification is enabled for the org. Used by the
  // record detail panel to render the "verified" badge against the
  // org-configured threshold.
  faceVerify?: { mode: string; threshold: number };
  records: AttendanceRecord[];
  error?: string;
}

export function MyAttendance() {
  const today = useMemo(() => todayIso(), []);
  const [from, setFrom] = useState<string>(() => shiftDays(today, -29));
  const [to, setTo] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [regularizing, setRegularizing] = useState<AttendanceRecord | null>(null);

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

  const summary = data?.summary;

  return (
    <div className="space-y-4">
      {/* Range + actions */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="from" className="text-xs text-gray-600">
              From
            </Label>
            <Input
              id="from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to" className="text-xs text-gray-600">
              To
            </Label>
            <Input
              id="to"
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTo(today);
                setFrom(shiftDays(today, -6));
              }}
            >
              7 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTo(today);
                setFrom(shiftDays(today, -29));
              }}
            >
              30 days
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const start = today.slice(0, 7) + "-01";
                setFrom(start);
                setTo(today);
              }}
            >
              This month
            </Button>
            <Button
              size="sm"
              onClick={fetchHistory}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-1.5" />
              )}
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryTile
          label="Present days"
          value={summary ? String(summary.presentDays) : "—"}
        />
        <SummaryTile
          label="Late days"
          value={summary ? String(summary.lateDays) : "—"}
          accent={summary && summary.lateDays > 0 ? "amber" : undefined}
        />
        <SummaryTile
          label="Total worked"
          value={summary ? formatHM(summary.totalWorkedMinutes) : "—"}
        />
        <SummaryTile
          label="Total overtime"
          value={summary ? formatHM(summary.totalOvertimeMinutes) : "—"}
          accent={summary && summary.totalOvertimeMinutes > 0 ? "blue" : undefined}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center gap-2 py-12 justify-center text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : data ? (
        <AttendanceRecordsTable
          records={data.records}
          onSelect={(r) => setSelected(r)}
          onRequestCorrection={(r) => setRegularizing(r)}
        />
      ) : null}

      <div className="text-right">
        <Link
          href="/attendance/regularizations"
          className="text-xs text-blue-700 hover:underline"
        >
          View my regularization requests →
        </Link>
      </div>

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
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "amber" | "blue";
}) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div
        className={[
          "text-xl font-semibold tabular-nums",
          accent === "amber" && "text-amber-700",
          accent === "blue" && "text-blue-700",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500 mt-0.5">
        {label}
      </div>
    </div>
  );
}
