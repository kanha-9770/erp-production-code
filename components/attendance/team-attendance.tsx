"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  RefreshCcw,
  AlertTriangle,
  ShieldAlert,
  Plus,
  MapPin,
  Info,
} from "lucide-react";
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
  geofence?: {
    mode: "OFF" | "CAPTURE" | "ENFORCE";
    lat: number | null;
    lng: number | null;
    radiusM: number | null;
  };
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
    <div className="space-y-3">
      <Card>
        <CardContent className="p-2.5 flex flex-wrap items-center gap-2">
          {/* From / To share a single row — labels sit inline-left of
              each date input. Compact h-7 sizing to keep the toolbar
              tight on mobile. */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <Label htmlFor="t-from" className="text-[11px] text-gray-600 shrink-0">
              From
            </Label>
            <Input
              id="t-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="h-7 flex-1 min-w-0 sm:flex-none sm:w-36 text-xs"
            />
            <Label htmlFor="t-to" className="text-[11px] text-gray-600 shrink-0 ml-1">
              To
            </Label>
            <Input
              id="t-to"
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => setTo(e.target.value)}
              className="h-7 flex-1 min-w-0 sm:flex-none sm:w-36 text-xs"
            />
          </div>
          <div className="ml-auto w-full sm:w-64">
            <Input
              id="t-search"
              placeholder="Search by name, email, status…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <div className="flex flex-nowrap gap-1.5 w-full sm:w-auto">
            <Button
              size="sm"
              className="h-7 px-2 text-xs flex-1 sm:flex-none"
              onClick={fetchTeam}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5 mr-1" />
              )}
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs flex-1 sm:flex-none"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Manual
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end -mt-1">
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

      {data?.geofence && <GeofenceStatus geofence={data.geofence} />}

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

// Compact strip that surfaces the org's saved geofence settings so admins
// can immediately see whether out-of-radius / no-location flags will fire,
// instead of staring at an empty "Where" column wondering if the config
// even saved.
function GeofenceStatus({
  geofence,
}: {
  geofence: NonNullable<TeamResponse["geofence"]>;
}) {
  const configured =
    geofence.lat != null && geofence.lng != null && geofence.radiusM != null;

  if (!configured) {
    return (
      <div className="flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 leading-snug">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <span className="font-semibold">Geofence not configured.</span>{" "}
          <Link
            href="/settings/attendance-config"
            className="underline hover:no-underline"
          >
            Configure in Settings
          </Link>
          {" "}so out-of-radius punches get flagged here.
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-2 text-[11px] text-blue-900 leading-snug">
      <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <span className="font-semibold">
          Geofence · {geofence.radiusM}m
        </span>
        {" · "}
        <span className="text-blue-800">
          {geofence.lat?.toFixed(4)}, {geofence.lng?.toFixed(4)} · mode{" "}
          <span className="font-mono">{geofence.mode.toLowerCase()}</span>
        </span>
      </div>
      <Info className="h-3 w-3 mt-0.5 text-blue-500" />
    </div>
  );
}
