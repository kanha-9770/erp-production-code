"use client";

/**
 * Team Attendance — admin / approver view of org-wide attendance.
 *
 * Wears the same WorkspaceShell + WorkspaceHeader clothing as My Attendance
 * and My Leave so the three sit visually flush: title block on the left,
 * actions on the right, a sticky page header, and a "list area" below that
 * scrolls independently. Selecting a row opens the existing detail sheet —
 * the workspace preview pane stays null because the detail is already a
 * full-height slide-out.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  RefreshCw,
  AlertTriangle,
  ShieldAlert,
  Plus,
  MapPin,
  Info,
  Users,
  Search,
  Inbox,
  FileText,
  X as XIcon,
} from "lucide-react";
import Link from "next/link";
import { AttendanceRecordsTable } from "./attendance-records-table";
import { AttendanceRecordDetail, type AttendanceRecord } from "./attendance-record-detail";
import { ManualEntryDialog } from "./manual-entry-dialog";
import { todayIso } from "./attendance-format";
import { setOrgTimezone, useOrgTimezone } from "@/lib/org-timezone";
import {
  WorkspaceShell,
  WorkspaceHeader,
  ActiveFilterPills,
} from "@/components/real-estate/workspace";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

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
  reportTimezone?: string;
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
  // Attendance times render in the org's reportTimezone — subscribe so an
  // admin saving a new value in Attendance Configuration ripples here.
  useOrgTimezone();
  const today = useMemo(() => todayIso(), []);
  const [from, setFrom] = useState<string>(today);
  const [to, setTo] = useState<string>(today);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
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
      // Anchor the table cells to the org's tz before the first paint.
      setOrgTimezone(json.reportTimezone);
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

  const totalRecords = data?.records.length ?? 0;
  const filteredCount = decorated.length;

  const activePills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (search) {
      pills.push({
        key: "search",
        label: <>Search: <strong>{search}</strong></>,
      });
    }
    return pills;
  }, [search]);

  return (
    <>
      <WorkspaceShell
        scope="team-attendance"
        selectedId={null}
        onCloseSelection={() => {}}
        header={
          <>
            <WorkspaceHeader
              icon={<Users className="h-5 w-5 text-blue-600" />}
              title="Team Attendance"
              subtitle={
                data && !forbidden
                  ? `${filteredCount}${
                      filteredCount !== totalRecords ? ` / ${totalRecords}` : ""
                    } record${filteredCount === 1 ? "" : "s"} · ${from}${
                      from !== to ? ` → ${to}` : ""
                    }`
                  : undefined
              }
            >
              {/* Search collapses to a 🔍 icon button + popover so the
                  header stays compact on mobile — mirrors Self Target. */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 relative shrink-0"
                    aria-label="Search"
                    disabled={forbidden}
                  >
                    <Search className="h-3.5 w-3.5" />
                    {search && (
                      <span
                        aria-hidden
                        className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={6} className="w-72 p-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search name, email, status…"
                      value={searchInput}
                      onChange={(e) => {
                        setSearchInput(e.target.value);
                        setSearch(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setSearchInput("");
                          setSearch("");
                        }
                      }}
                      autoFocus
                      className="pl-8 pr-7 h-8 w-full text-sm"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(""); setSearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <XIcon className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="icon"
                onClick={fetchTeam}
                disabled={loading || forbidden}
                title="Refresh"
                aria-label="Refresh"
                className="h-8 w-8 shrink-0"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                size="sm"
                onClick={() => setManualOpen(true)}
                disabled={forbidden}
                className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
              >
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">Manual entry</span>
                <span className="sm:hidden">Manual</span>
              </Button>
            </WorkspaceHeader>

            {/* Compact filter row — mirrors Self Target's filter pill row.
                FROM/TO date inputs sit on the left; active filter pills
                wrap; the regularizations link anchors to the right. */}
            {!forbidden && (
              <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2 border-t pt-2">
                <div className="inline-flex items-center gap-1 rounded-md border bg-background px-2 h-7">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    From
                  </span>
                  <Input
                    id="team-from"
                    type="date"
                    value={from}
                    max={to}
                    onChange={(e) => setFrom(e.target.value)}
                    className="h-6 w-32 border-0 p-0 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                    aria-label="From date"
                  />
                </div>
                <div className="inline-flex items-center gap-1 rounded-md border bg-background px-2 h-7">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    To
                  </span>
                  <Input
                    id="team-to"
                    type="date"
                    value={to}
                    min={from}
                    max={today}
                    onChange={(e) => setTo(e.target.value)}
                    className="h-6 w-32 border-0 p-0 text-xs focus-visible:ring-0 focus-visible:ring-offset-0"
                    aria-label="To date"
                  />
                </div>
                <ActiveFilterPills
                  filters={activePills}
                  onClear={(k) => {
                    if (k === "search") { setSearch(""); setSearchInput(""); }
                  }}
                  onClearAll={() => { setSearch(""); setSearchInput(""); }}
                />
                <Link
                  href="/attendance/regularizations"
                  className="w-full sm:w-auto sm:ml-auto text-xs text-blue-700 hover:underline shrink-0"
                >
                  Pending regularization requests →
                </Link>
              </div>
            )}
          </>
        }
        list={
          <div className="flex flex-col h-full bg-muted/10">
            {forbidden ? (
              <ForbiddenPanel />
            ) : (
              <>
                {/* ── Toolbar: geofence chip + error ───────────────────────── */}
                <div className="p-3 sm:p-4 pb-2 space-y-3">
                  {data?.geofence && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <GeofenceStatus geofence={data.geofence} />
                    </div>
                  )}

                  {error && (
                    <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>

                {/* ── Records table ─────────────────────────────────────── */}
                {/* AttendanceRecordsTable supplies its own border+rounded
                    card chrome, so we don't add another wrapper around it
                    — that produced double borders. The empty/loading state
                    matches the same card silhouette so the page doesn't
                    jump as data arrives. */}
                <div className="flex-1 min-h-0 px-3 sm:px-4 pb-4 overflow-auto">
                  {loading && !data ? (
                    <div className="bg-background border rounded-md flex items-center gap-2 py-16 justify-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading team attendance…
                    </div>
                  ) : decorated.length === 0 ? (
                    <div className="bg-background border rounded-md py-16 text-center text-muted-foreground">
                      <Inbox className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">
                        {search
                          ? "No records match your search."
                          : "No attendance records in this range."}
                      </p>
                    </div>
                  ) : (
                    <AttendanceRecordsTable
                      records={decorated}
                      showName
                      onSelect={(r) => setSelected(r)}
                    />
                  )}
                </div>
              </>
            )}
          </div>
        }
        preview={null}
      />

      <AttendanceRecordDetail record={selected} onClose={() => setSelected(null)} />
      <ManualEntryDialog
        open={manualOpen}
        onOpenChange={setManualOpen}
        onSuccess={fetchTeam}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Forbidden panel — shown when the API returns 403. Kept as a centered card
// inside the list area so the WorkspaceShell chrome (header + back nav) stays
// usable instead of leaving the user on an empty page with no way out.
// ─────────────────────────────────────────────────────────────────────────

function ForbiddenPanel() {
  return (
    <div className="flex-1 flex items-center justify-center p-4 sm:p-6">
      <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <div className="flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div className="font-semibold text-base">Admin access required</div>
            <p className="text-amber-800 dark:text-amber-300/90 leading-relaxed">
              Team attendance is visible only to org admins and assigned
              attendance approvers. Ask the org owner to grant the role if you
              should have access.
            </p>
            <div className="pt-2 flex flex-wrap gap-2">
              <Link
                href="/attendance"
                className="inline-flex items-center gap-1.5 text-xs font-medium underline hover:no-underline"
              >
                <FileText className="h-3.5 w-3.5" /> Back to My Attendance
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Geofence status — surfaces the org's saved geofence settings inline so
// admins can see at a glance whether out-of-radius / no-location flags will
// fire. Rendered as a soft chip inside the toolbar (was a bigger banner
// before) to match the My Attendance look.
// ─────────────────────────────────────────────────────────────────────────

function GeofenceStatus({
  geofence,
}: {
  geofence: NonNullable<TeamResponse["geofence"]>;
}) {
  const configured =
    geofence.lat != null && geofence.lng != null && geofence.radiusM != null;

  if (!configured) {
    return (
      <div className="inline-flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900 leading-snug dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
        <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
        <div className="flex-1">
          <span className="font-semibold">Geofence not configured.</span>{" "}
          <Link
            href="/settings/attendance-config"
            className="underline hover:no-underline"
          >
            Configure in Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-[11px] leading-snug">
      <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
      <span className="font-semibold">Geofence · {geofence.radiusM}m</span>
      <span className="text-muted-foreground">
        ({geofence.lat?.toFixed(4)}, {geofence.lng?.toFixed(4)})
      </span>
      <Badge variant="outline" className="text-[9px] uppercase ml-0.5">
        {geofence.mode.toLowerCase()}
      </Badge>
      <Info className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}
