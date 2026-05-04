"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw, AlertTriangle, ShieldAlert, Plus } from "lucide-react";
import Link from "next/link";
import { AttendanceRecordsTable } from "./attendance-records-table";
import { AttendanceRecordDetail, type AttendanceRecord } from "./attendance-record-detail";
import { ManualEntryDialog } from "./manual-entry-dialog";
import { todayIso } from "./attendance-format";

interface TeamUser {
  id: string;
  email: string;
  name: string;
  department: string | null;
  designation: string | null;
  employeeId: string | null;
}

interface TeamResponse {
  success: boolean;
  from: string;
  to: string;
  users: TeamUser[];
  records: AttendanceRecord[];
  error?: string;
}

export function TeamAttendance() {
  const today = useMemo(() => todayIso(), []);
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TeamResponse | null>(null);
  const [selected, setSelected] = useState<AttendanceRecord | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const fetchTeam = useCallback(async () => {
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      const url = `/api/attendance/team?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as TeamResponse;
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load team attendance");
      }
      setData(json);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load team attendance");
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Decorate records with user info + filter by free-text search.
  const decorated = useMemo(() => {
    if (!data) return [] as AttendanceRecord[];
    const userById = new Map<string, TeamUser>();
    for (const u of data.users) userById.set(u.id, u);
    const q = search.trim().toLowerCase();
    return data.records
      .map((r) => {
        const u = userById.get(r.userId ?? "");
        return {
          ...r,
          userName: u?.name,
          userEmail: u?.email,
        };
      })
      .filter((r) => {
        if (!q) return true;
        const blob =
          `${r.userName ?? ""} ${r.userEmail ?? ""} ${r.status ?? ""}`.toLowerCase();
        return blob.includes(q);
      });
  }, [data, search]);

  if (forbidden) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5" />
        <div>
          <div className="font-semibold">Admin access required</div>
          <div className="text-amber-800 mt-1">
            Team attendance is visible only to org admins. If you should have
            access, ask the org owner to grant the admin role.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-from" className="text-xs text-gray-600">
              From
            </Label>
            <Input
              id="t-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="t-to" className="text-xs text-gray-600">
              To
            </Label>
            <Input
              id="t-to"
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 w-44"
            />
          </div>
          <div className="space-y-1.5 ml-auto w-full sm:w-72">
            <Label htmlFor="t-search" className="text-xs text-gray-600">
              Search
            </Label>
            <Input
              id="t-search"
              placeholder="Filter by name, email, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9"
            />
          </div>
          <Button size="sm" onClick={fetchTeam} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4 mr-1.5" />
            )}
            Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Manual entry
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end -mt-2">
        <Link
          href="/attendance/regularizations"
          className="text-xs text-blue-700 hover:underline"
        >
          Pending regularization requests →
        </Link>
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
      ) : (
        <AttendanceRecordsTable
          records={decorated}
          showName
          onSelect={(r) => setSelected(r)}
        />
      )}

      <AttendanceRecordDetail record={selected} onClose={() => setSelected(null)} />
      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSuccess={fetchTeam}
      />
    </div>
  );
}
