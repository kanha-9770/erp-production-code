"use client";

/**
 * Kaizen — premium workspace layout.
 */

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import {
  TrendingUp, Plus, Search, Calendar, Briefcase, Pencil, Trash2,
  ThumbsUp, CheckCircle2, Lightbulb, Zap, Type, FileText, Layout,
  ArrowRight, Save, X, UserCircle, AlertCircle, Info, Paperclip, Upload, Camera,
  ExternalLink,
} from "lucide-react";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  SelectFilter, ActiveFilterPills,
  ViewsBar, useSavedViews,
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useEngagementVisibility,
  makeEngagementFilter,
} from "@/hooks/useEngagementVisibility";
import { useGetEmployeeListQuery } from "@/lib/api/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import { SubmitterDetails } from "@/components/employee-engagement/submitter-details";
import { Checkbox } from "@/components/ui/checkbox";
import {
  COMPANY_STATUS_OPTIONS,
  BENEFIT_OPTIONS,
  STANDARD_UPDATED_OPTIONS,
  getStatusMeta,
  encodeBenefits,
  decodeBenefits,
} from "@/lib/constants/engagement";

interface Kaizen {
  id: string;
  title: string;
  description: string;
  currentState: string;
  proposedState: string;
  benefits: string;
  // Status uses the company's 5-state workflow from the status sheet, plus
  // legacy values for rows created before that palette was introduced.
  status: string;
  submissionDate: string;
  votes: number;
  hasVoted: boolean;
  employeeId: string;
}

const STATUS_OPTIONS = COMPANY_STATUS_OPTIONS;

const KAIZEN_AREA_FILTER_OPTIONS = [
  { value: "safety", label: "Safety" },
  { value: "quality", label: "Quality" },
  { value: "cost", label: "Cost" },
  { value: "delivery", label: "Delivery" },
  { value: "morale", label: "Morale" },
  { value: "environment", label: "Environment" },
  { value: "productivity", label: "Productivity" },
  { value: "other", label: "Other" },
];

const DEPARTMENT_FILTER_OPTIONS = [
  { value: "HR", label: "HR" },
  { value: "Engineering", label: "Engineering" },
  { value: "Production", label: "Production" },
  { value: "Quality", label: "Quality" },
  { value: "Maintenance", label: "Maintenance" },
  { value: "Sales", label: "Sales" },
  { value: "Finance", label: "Finance" },
  { value: "Admin", label: "Admin" },
  { value: "Other", label: "Other" },
];

interface Filters {
  search: string;
  status: string;
  kaizenArea: string;
  department: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", kaizenArea: "", department: "" };

export default function KaizenPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  // Engagement points are awarded by HR/Admin after reviewing the
  // submission — they're NOT something the employee fills in themselves.
  const canSetPoints = isAdmin || (
    (user as any)?.unitAssignments?.some(
      (ua: any) => /\bHR\b/i.test(ua?.role?.name ?? ""),
    ) ?? false
  );
  const visibility = useEngagementVisibility();
  const { toast } = useToast();

  const [kaizens, setKaizens] = useState<Kaizen[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Admin/HR review decision per Kaizen (submissionId → status). Lets the
  // employee see whether their submission was Approved / Rejected / etc.
  // Sourced from /api/engagement/awards (org-scoped, read-only here).
  const [reviewByKaizen, setReviewByKaizen] = useState<Record<string, { status: string; reviewer: string | null; points: number | null }>>({});

  const { data: empData } = useGetEmployeeListQuery();
  const employees = empData?.employees ?? [];
  const currentEmployee = employees.find(e => e.userId === user?.id);

  // employeeId → engagementTeamId map used by the visibility filter so we
  // can answer "is this record's author on my team?" in O(1).
  const employeeToTeam = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of employees) {
      m.set(e.id, (e as any).engagementTeamId ?? null);
    }
    return m;
  }, [employees]);

  // Other members of the current user's engagement team (self excluded).
  // Used by KaizenForm's "Employee Contributor" multi-select. Empty array
  // when the user isn't on an engagement team yet — the form handles that
  // case with a "no contributors available" hint.
  const teamMembers = useMemo(() => {
    if (!currentEmployee) return [];
    const myTeam = employeeToTeam.get(currentEmployee.id) ?? null;
    if (!myTeam) return [];
    return employees.filter(
      (e) => e.id !== currentEmployee.id && employeeToTeam.get(e.id) === myTeam,
    );
  }, [employees, employeeToTeam, currentEmployee]);

  const views = useSavedViews<Filters>("kaizens");

  // Fetches the team-scoped list from the API. The server already applies
  // visibility (Admin/HR see all; team members see own team; unassigned see
  // own), but we run the same client filter as a defensive layer so a stale
  // response can't bleed across teams.
  const loadKaizens = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/engagement/kaizens", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? "Failed to load kaizens");
      }
      const rows: Kaizen[] = json.kaizens ?? [];
      const allow = makeEngagementFilter<Kaizen>(visibility, employeeToTeam);
      setKaizens(rows.filter(allow));
    } catch (e: any) {
      toast({ title: "Failed to load kaizens", description: e?.message, variant: "destructive" });
      setKaizens([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, visibility, employeeToTeam, toast]);

  useEffect(() => {
    if (user?.id && !visibility.loading) {
      loadKaizens();
    }
  }, [user?.id, isAdmin, employees.length, visibility, loadKaizens]);

  // Pull the admin/HR review decisions so the Approved/Rejected badge can
  // be shown next to each Kaizen.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/engagement/awards", { cache: "no-store", credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.success) return;
        const next: Record<string, { status: string; reviewer: string | null; points: number | null }> = {};
        for (const a of data.awards as Array<{ submissionId: string; moduleType: string; reviewStatus: string | null; reviewerName: string | null; points: number | null }>) {
          if (a.moduleType === "Kaizen" && a.reviewStatus) {
            next[a.submissionId] = { status: a.reviewStatus, reviewer: a.reviewerName ?? null, points: a.points ?? null };
          }
        }
        setReviewByKaizen(next);
      } catch {
        /* ignore — badge just won't show */
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, kaizens.length]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Theme", type: "text" },
    { id: "description", label: "Problem", type: "text" },
    { id: "currentState", label: "Why Analysis", type: "text" },
    { id: "proposedState", label: "Result", type: "text" },
    { id: "benefits", label: "Benefits", type: "text" },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "kaizenArea", label: "Kaizen Area", type: "select", options: KAIZEN_AREA_FILTER_OPTIONS },
    { id: "department", label: "Department", type: "select", options: DEPARTMENT_FILTER_OPTIONS },
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "employeeEngagementTeamName", label: "Team Name", type: "text" },
    { id: "employeeContributor", label: "Employee Contributor", type: "text" },
    { id: "startDate", label: "Start Date", type: "date" },
    { id: "submissionDate", label: "Submitted", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = kaizens;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(k => k.title.toLowerCase().includes(q) || k.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(k => k.status === filters.status);
    if (filters.kaizenArea) result = result.filter(k => (k as any).kaizenArea === filters.kaizenArea);
    if (filters.department) result = result.filter(k => (k as any).department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [kaizens, filters, conditions, filterFields]);

  const columns: ColumnDef<Kaizen>[] = useMemo(() => {
    // Helper for plain-text columns sourced from the (possibly extended)
    // server payload. Many KaizenForm fields aren't in the typed interface
    // because they're forwarded as-is to the backend, so we read them off
    // the record dynamically.
    const text = (k: Kaizen, key: string) => {
      const v = (k as any)[key];
      return v === null || v === undefined || v === "" ? "—" : String(v);
    };
    const dateCell = (k: Kaizen, key: string) => {
      const v = (k as any)[key];
      if (!v) return <span className="text-xs text-muted-foreground">—</span>;
      const d = new Date(v);
      return <span className="text-xs text-muted-foreground">{isNaN(d.getTime()) ? String(v) : d.toLocaleDateString()}</span>;
    };
    const plain = (k: Kaizen, key: string) => <span className="text-xs truncate">{text(k, key)}</span>;

    // Media columns render a small image thumbnail when the stored value
    // is a URL or `data:` URL, instead of dumping the long string.
    const mediaCell = (k: Kaizen, key: string) => {
      const v = (k as any)[key] as string | null | undefined;
      if (!v) return <span className="text-xs text-muted-foreground">—</span>;
      const isImg = v.startsWith("data:image/") || v.startsWith("http://") || v.startsWith("https://") || v.startsWith("/");
      if (!isImg) {
        return <span className="text-xs truncate font-mono" title={v}>{v.length > 24 ? v.slice(0, 24) + "…" : v}</span>;
      }
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v}
          alt={key}
          className="h-10 w-16 rounded border bg-white object-cover"
        />
      );
    };

    return [
      {
        id: "title",
        header: "Kaizen Idea",
        width: 300,
        pinned: true,
        cell: (k) => (
          <div className="min-w-0">
            <div className="font-medium truncate uppercase">{k.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{k.description}</div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 200,
        group: "Overview",
        cell: (k) => {
          const meta = getStatusMeta(k.status);
          return (
            <Badge variant="outline" className={`${meta.className} text-[10px] uppercase`}>
              {meta.label}
            </Badge>
          );
        },
      },
      {
        id: "review",
        header: "Review",
        width: 150,
        group: "Overview",
        cell: (k) => {
          const r = reviewByKaizen[k.id];
          if (!r) return <span className="text-[10px] text-muted-foreground italic">Awaiting</span>;
          const map: Record<string, string> = {
            approved: "bg-emerald-100 text-emerald-700 border-emerald-200",
            rejected: "bg-rose-100 text-rose-700 border-rose-200",
            "needs-info": "bg-blue-100 text-blue-700 border-blue-200",
            pending: "bg-amber-100 text-amber-700 border-amber-200",
          };
          const label = r.status === "rejected" ? "Not Approved" : r.status === "needs-info" ? "Needs Info" : r.status === "pending" ? "Pending" : "Approved";
          return (
            <Badge variant="outline" className={`text-[10px] uppercase border ${map[r.status] ?? ""}`}>
              {label}
            </Badge>
          );
        },
      },
      {
        id: "votes",
        header: "Votes",
        width: 100,
        align: "center",
        group: "Overview",
        cell: (k) => (
          <div className="flex items-center justify-center gap-1.5 font-medium text-sm">
            <ThumbsUp className={`h-3.5 w-3.5 ${k.hasVoted ? 'text-blue-600 fill-blue-600' : 'text-muted-foreground'}`} />
            {k.votes}
          </div>
        ),
      },
      {
        id: "date",
        header: "Submitted",
        width: 130,
        group: "Overview",
        cell: (k) => <span className="text-xs text-muted-foreground">{new Date(k.submissionDate).toLocaleDateString()}</span>,
      },

      // ── Section 1: Kaizen Info ────────────────────────────────────────
      { id: "employeeId", header: "Employee ID", width: 140, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "employeeId") },
      { id: "firstName", header: "First Name", width: 140, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "firstName") },
      { id: "middleName", header: "Middle Name", width: 140, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "middleName") },
      { id: "lastName", header: "Last Name", width: 140, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "lastName") },
      { id: "department", header: "Department", width: 140, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "department") },
      { id: "employeeEngagementTeamName", header: "Employee Engagement Team Name", width: 200, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "employeeEngagementTeamName") },
      { id: "kaizenArea", header: "Kaizen Area", width: 140, group: "Kaizen Info", defaultHidden: true, cell: (k) => plain(k, "kaizenArea") },
      { id: "startDate", header: "Start Date", width: 130, group: "Kaizen Info", defaultHidden: true, cell: (k) => dateCell(k, "startDate") },

      // ── Section 2: Problem & Analysis ─────────────────────────────────
      { id: "description", header: "Problem", width: 240, group: "Problem & Analysis", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.description || "—"}</span> },
      { id: "beforeMedia", header: "Before Kaizen", width: 160, group: "Problem & Analysis", defaultHidden: true, cell: (k) => mediaCell(k, "beforeMedia") },
      { id: "afterMedia", header: "After Kaizen", width: 160, group: "Problem & Analysis", defaultHidden: true, cell: (k) => mediaCell(k, "afterMedia") },
      { id: "currentState", header: "Why Analysis", width: 240, group: "Problem & Analysis", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.currentState || "—"}</span> },

      // ── Section 3: Result & Benefits ──────────────────────────────────
      { id: "proposedState", header: "Result", width: 240, group: "Result & Benefits", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.proposedState || "—"}</span> },
      { id: "benefits", header: "Benefits", width: 240, group: "Result & Benefits", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.benefits || "—"}</span> },
      { id: "employeeContributor", header: "Employee Contributor", width: 180, group: "Result & Benefits", defaultHidden: true, cell: (k) => plain(k, "employeeContributor") },
      { id: "signature", header: "Signature", width: 160, group: "Result & Benefits", defaultHidden: true, cell: (k) => mediaCell(k, "signature") },
      { id: "selfie", header: "Selfie", width: 160, group: "Result & Benefits", defaultHidden: true, cell: (k) => mediaCell(k, "selfie") },
      { id: "employeeEngagementPoints", header: "Employee Engagement Points", width: 180, group: "Result & Benefits", defaultHidden: true, align: "right", cell: (k) => plain(k, "employeeEngagementPoints") },
    ];
  }, [reviewByKaizen]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this kaizen?")) return;
    try {
      const res = await fetch(`/api/engagement/kaizens/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Delete failed");
      setKaizens(kaizens.filter(k => k.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Kaizen deleted" });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  const handleVote = async (id: string) => {
    const target = kaizens.find(k => k.id === id);
    if (!target) return;
    const nextVote = !target.hasVoted;
    // Optimistic update so the UI is responsive; if the API fails, restore.
    setKaizens(kaizens.map(k => k.id === id ? {
      ...k,
      votes: nextVote ? k.votes + 1 : Math.max(0, k.votes - 1),
      hasVoted: nextVote,
    } : k));
    try {
      const res = await fetch(`/api/engagement/kaizens/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ vote: nextVote }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Vote failed");
      // Sync from server in case another voter raced us.
      setKaizens(prev => prev.map(k => k.id === id ? { ...k, votes: json.kaizen.votes, hasVoted: json.kaizen.hasVoted } : k));
    } catch (e: any) {
      // Revert optimistic change.
      setKaizens(prev => prev.map(k => k.id === id ? target : k));
      toast({ title: "Vote failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <>
      <WorkspaceShell
        scope="kaizens"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<TrendingUp className="h-5 w-5 text-green-600" />}
              title="Kaizen"
              subtitle={`${items.length} idea${items.length === 1 ? "" : "s"}`}
            >
              {/* Search collapses to a 🔍 icon button + popover so the
                  header stays compact on mobile. */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 relative shrink-0"
                    aria-label="Search"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {filters.search && (
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
                      placeholder="Search kaizens..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") updateFilter("search", searchInput);
                        if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
                      }}
                      autoFocus
                      className="pl-8 pr-7 h-8 w-full text-sm"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(""); updateFilter("search", ""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="kaizens"
                columns={columns}
                variant="dialog"
              />
              <Button
                size="sm"
                className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">New Kaizen</span>
                <span className="sm:hidden">New</span>
              </Button>
            </WorkspaceHeader>

            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2">
              <ViewsBar
                views={views.views}
                activeId={views.activeId}
                onSelect={(id) => {
                   views.select(id);
                   const v = views.views.find(x => x.id === id);
                   if (v) { setFilters(v.filters); setSearchInput(v.filters.search); }
                   else { setFilters(EMPTY_FILTERS); setSearchInput(""); }
                }}
                onSave={(name) => views.save(name, filters)}
                onDelete={views.remove}
                isDirty={JSON.stringify(views.views.find(v => v.id === views.activeId)?.filters ?? EMPTY_FILTERS) !== JSON.stringify(filters)}
              />
            </div>

            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2 border-t pt-2">
              <SelectFilter label="Status" value={filters.status} onChange={(v) => updateFilter("status", v)} options={STATUS_OPTIONS} />
              <SelectFilter label="Kaizen Area" value={filters.kaizenArea} onChange={(v) => updateFilter("kaizenArea", v)} options={KAIZEN_AREA_FILTER_OPTIONS} />
              <SelectFilter label="Department" value={filters.department} onChange={(v) => updateFilter("department", v)} options={DEPARTMENT_FILTER_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<Kaizen>
            tableId="kaizens"
            columns={columns}
            rows={items}
            rowId={(k) => k.id}
            pageSize={10}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(k) => setSelectedId(k.id)}
          />
        }
        preview={selectedId ? <KaizenPreview id={selectedId} kaizens={kaizens} employees={employees} isAdmin={isAdmin} review={reviewByKaizen[selectedId]} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} onVote={handleVote} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} kaizens={kaizens} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Kaizen <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <KaizenForm
            currentEmployee={currentEmployee}
            canSetPoints={canSetPoints}
            teamMembers={teamMembers}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (data) => {
              try {
                const res = await fetch("/api/engagement/kaizens", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(data),
                });
                const json = await res.json();
                if (!res.ok || !json?.success) throw new Error(json?.error ?? "Submit failed");
                setKaizens([json.kaizen as Kaizen, ...kaizens]);
                setCreateOpen(false);
                toast({ title: "Kaizen submitted" });
              } catch (e: any) {
                toast({ title: "Could not submit", description: e?.message, variant: "destructive" });
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-4xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Kaizen <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          {editingId && (
            <KaizenForm
              initial={kaizens.find(k => k.id === editingId)}
              currentEmployee={currentEmployee}
              canSetPoints={canSetPoints}
              teamMembers={teamMembers}
              onCancel={() => setEditingId(null)}
              onSubmit={async (data) => {
                try {
                  const res = await fetch(`/api/engagement/kaizens/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.success) throw new Error(json?.error ?? "Update failed");
                  setKaizens(kaizens.map(k => k.id === editingId ? (json.kaizen as Kaizen) : k));
                  setEditingId(null);
                  toast({ title: "Kaizen updated" });
                } catch (e: any) {
                  toast({ title: "Could not update", description: e?.message, variant: "destructive" });
                }
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PreviewHeader({ id, kaizens }: { id: string, kaizens: Kaizen[] }) {
  const k = kaizens.find(x => x.id === id);
  if (!k) return null;
  const meta = getStatusMeta(k.status);
  return (
    <div className="flex items-center gap-2 min-w-0 w-full">
      <Badge variant="outline" className={`text-[10px] uppercase ${meta.className}`}>{meta.label}</Badge>
      <span className="font-semibold text-sm truncate uppercase">{k.title}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/employee-engagement/kaizen/${k.id}`} title="Open full details">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function KaizenPreview({ id, kaizens, employees, isAdmin, review, onEdit, onDelete, onVote }: { id: string, kaizens: Kaizen[], employees: any[], isAdmin: boolean, review?: { status: string; reviewer: string | null; points: number | null }, onEdit: (id: string) => void, onDelete: (id: string) => void, onVote: (id: string) => void }) {
  const k = kaizens.find(x => x.id === id);
  if (!k) return null;
  const decoded = decodeBenefits(k.benefits);
  const benefitLabels = decoded.checked
    .map((v) => BENEFIT_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean) as string[];
  const standardLabels = decoded.standards
    .map((v) => STANDARD_UPDATED_OPTIONS.find((o) => o.value === v)?.label)
    .filter(Boolean) as string[];
  const statusMeta = getStatusMeta(k.status);

  // Media slots — laid out in the same order as the Kaizen form's
  // "Problem & Analysis" section (Before Media → After Media). Older
  // rows only have `referenceImage` populated, so we promote it into
  // the Before slot when `beforeMedia` is missing.
  const refImg = (k as any).referenceImage as string | null | undefined;
  const beforeMedia = ((k as any).beforeMedia ?? refImg) as string | null | undefined;
  const afterMedia = (k as any).afterMedia as string | null | undefined;
  const isImg = (s: string | null | undefined): s is string =>
    !!s && (
      s.startsWith("data:image/") ||
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("/")
    );
  const mediaSlots = [
    { label: "Before Kaizen", value: beforeMedia ?? null },
    { label: "After Kaizen", value: afterMedia ?? null },
  ];
  const hasAnyMedia = mediaSlots.some((m) => !!m.value);

  // Surface the full Kaizen record. Anything we don't render explicitly
  // above falls into the "All Submitted Fields" block at the bottom so the
  // admin always sees the complete row.
  const KNOWN_KEYS = new Set([
    "id", "title", "description", "currentState", "proposedState",
    "benefits", "status", "submissionDate", "votes", "hasVoted",
    "employeeId", "userId", "referenceImage", "beforeMedia", "afterMedia",
    // Employee identity + result fields — rendered in their own sections
    // below so they shouldn't dump as raw strings here too.
    "firstName", "middleName", "lastName", "department",
    "employeeEngagementTeamName", "kaizenArea",
    "employeeContributor", "signature", "selfie", "employeeEngagementPoints",
  ]);

  // Signature + selfie image surface — captured by the form (finger-draw,
  // camera, or upload), displayed here so the reviewer can verify both
  // at a glance without opening the full record page.
  const signature = (k as any).signature as string | null | undefined;
  const selfie = (k as any).selfie as string | null | undefined;
  const hasSignature = isImg(signature);
  const hasSelfie = isImg(selfie);
  const employeeContributor = (k as any).employeeContributor as string | undefined;
  const engagementPoints = (k as any).employeeEngagementPoints as number | undefined;
  const extraEntries = Object.entries(k as Record<string, unknown>).filter(
    ([key]) => !KNOWN_KEYS.has(key),
  );

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold uppercase">{k.title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant={k.hasVoted ? 'default' : 'outline'} size="sm" className="h-7 gap-1.5" onClick={() => onVote(k.id)}>
              <ThumbsUp className="h-3.5 w-3.5" /> {k.votes}
            </Button>
            <Badge variant="outline" className={`text-[10px] uppercase ${statusMeta.className}`}>
              {statusMeta.label}
            </Badge>
            <span className="text-[10px] text-muted-foreground font-mono">
              {k.id.substring(0, 8).toUpperCase()}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(k.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(k.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* Admin / HR review decision — visible to the employee. */}
      {(() => {
        const meta = (() => {
          switch (review?.status) {
            case "approved": return { label: "Approved", cls: "bg-emerald-50 border-emerald-200 text-emerald-800", icon: CheckCircle2 };
            case "rejected": return { label: "Not Approved", cls: "bg-rose-50 border-rose-200 text-rose-800", icon: X };
            case "needs-info": return { label: "Needs Info", cls: "bg-blue-50 border-blue-200 text-blue-800", icon: Info };
            case "pending": return { label: "Pending Review", cls: "bg-amber-50 border-amber-200 text-amber-800", icon: Info };
            default: return null;
          }
        })();
        if (!meta) {
          return (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              <Info className="h-4 w-4" /> Awaiting review by Admin / HR.
            </div>
          );
        }
        const RIcon = meta.icon;
        return (
          <div className={`flex items-center justify-between gap-3 rounded-md border p-3 ${meta.cls}`}>
            <span className="flex items-center gap-2 text-sm font-semibold">
              <RIcon className="h-4 w-4" /> {meta.label}
              {review?.reviewer && <span className="font-normal opacity-80">· by {review.reviewer}</span>}
            </span>
            {typeof review?.points === "number" && (
              <span className="text-sm font-bold">{review.points} pts</span>
            )}
          </div>
        );
      })()}

      <SubmitterDetails employeeId={k.employeeId} employees={employees} isAdmin={isAdmin} submissionDate={k.submissionDate} />

      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description</h3>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{k.description || "—"}</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3 bg-amber-50/30 border-amber-100">
          <h3 className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5"><Layout className="h-3 w-3" /> Current State</h3>
          <p className="text-xs whitespace-pre-wrap">{k.currentState || "—"}</p>
        </Card>
        <Card className="p-4 space-y-3 bg-blue-50/30 border-blue-100">
          <h3 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><Lightbulb className="h-3 w-3" /> Proposed State</h3>
          <p className="text-xs whitespace-pre-wrap">{k.proposedState || "—"}</p>
        </Card>
      </div>

      {hasAnyMedia && (
        <Card className="p-4 space-y-3 border-l-4 border-l-purple-500 bg-purple-50/50">
          <h3 className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
            <Layout className="h-3 w-3" /> Submitted Media
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mediaSlots.map((m) => (
              <div key={m.label} className="rounded-md border bg-white p-2 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </div>
                {!m.value ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground italic px-1 py-3">
                    <Paperclip className="h-3.5 w-3.5" />
                    Not provided
                  </div>
                ) : isImg(m.value) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.value}
                    alt={`${m.label} for ${k.title}`}
                    className="max-h-[320px] w-full rounded border bg-white object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-purple-900">
                    <Paperclip className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="font-mono text-xs truncate" title={m.value}>{m.value}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {(hasSignature || hasSelfie) && (
        <Card className="p-4 space-y-3 border-l-4 border-l-indigo-500 bg-indigo-50/50">
          <h3 className="text-[11px] font-semibold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
            <Pencil className="h-3 w-3" /> Signature &amp; Selfie
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-md border bg-white p-2 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Pencil className="h-3 w-3" /> Signature
              </div>
              {hasSignature ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signature!}
                  alt={`Signature for ${k.title}`}
                  className="max-h-40 w-full rounded border bg-white object-contain"
                />
              ) : (
                <p className="text-xs text-muted-foreground italic px-1 py-2">
                  Not provided.
                </p>
              )}
            </div>
            <div className="rounded-md border bg-white p-2 space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Camera className="h-3 w-3" /> Selfie
              </div>
              {hasSelfie ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selfie!}
                  alt={`Selfie for ${k.title}`}
                  className="max-h-40 w-full rounded border bg-white object-contain"
                />
              ) : (
                <p className="text-xs text-muted-foreground italic px-1 py-2">
                  Not provided.
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {(employeeContributor || (engagementPoints && engagementPoints > 0)) && (
        <Card className="p-4 space-y-3">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ThumbsUp className="h-3 w-3" /> Result &amp; Recognition
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <FieldRow
              label="Employee Contributor"
              value={employeeContributor || "—"}
              wide
            />
            <FieldRow
              label="Engagement Points Awarded"
              value={
                engagementPoints && engagementPoints > 0 ? String(engagementPoints) : "—"
              }
            />
          </div>
        </Card>
      )}

      <Card className="p-4 space-y-3 border-l-4 border-l-green-500 bg-green-50/50">
        <h3 className="text-[11px] font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1.5"><Zap className="h-3 w-3" /> Benefits</h3>
        {benefitLabels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {benefitLabels.map((b) => (
              <Badge key={b} variant="outline" className="bg-white text-[10px]">{b}</Badge>
            ))}
          </div>
        )}
        {decoded.freeText && <p className="text-sm whitespace-pre-wrap">{decoded.freeText}</p>}
        {benefitLabels.length === 0 && !decoded.freeText && (
          <p className="text-sm text-muted-foreground italic">No benefits recorded.</p>
        )}
      </Card>

      {standardLabels.length > 0 && (
        <Card className="p-4 space-y-2">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Standard Updated</h3>
          <div className="flex flex-wrap gap-1.5">
            {standardLabels.map((s) => (
              <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
            ))}
          </div>
        </Card>
      )}

      {/* All submitted fields — every key from the Kaizen record laid out
          as label / value pairs. Long-form fields render full-width; ids
          and small scalars share two columns. Anything not covered by the
          structured sections above still shows here so the admin sees the
          complete record. */}
      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <FileText className="h-3 w-3" /> All Submitted Fields
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <FieldRow label="Submission ID" value={k.id} mono />
          <FieldRow label="Status" value={statusMeta.label} />
          <FieldRow label="Submitted On" value={new Date(k.submissionDate).toLocaleString()} />
          <FieldRow label="Votes" value={String(k.votes)} />
          <FieldRow label="Employee ID" value={k.employeeId || "—"} mono />
          <FieldRow label="User ID" value={(k as any).userId || "—"} mono />
          <FieldRow label="Has Voted (by you)" value={k.hasVoted ? "Yes" : "No"} />
          <FieldRow label="Before Kaizen" value={summarizeMedia(beforeMedia)} mono />
          <FieldRow label="After Kaizen" value={summarizeMedia(afterMedia)} mono />
          <FieldRow label="Reference Image (legacy)" value={summarizeMedia(refImg)} mono />
          <FieldRow label="Raw Benefits" value={k.benefits || "—"} wide />
          {extraEntries.map(([key, value]) => (
            <FieldRow
              key={key}
              label={key}
              value={value === null || value === undefined
                ? "—"
                : typeof value === "object"
                  ? JSON.stringify(value)
                  : String(value)}
              wide={typeof value === "string" && value.length > 40}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

// Compact label for media stored as data URLs / URLs — the full payload
// can be hundreds of KB and isn't useful in the field-dump section
// (the actual image is rendered above in "Submitted Media").
function summarizeMedia(value: string | null | undefined): string {
  if (!value) return "—";
  if (value.startsWith("data:image/")) {
    const kb = Math.round((value.length * 3) / 4 / 1024);
    return `Image attached (~${kb} KB)`;
  }
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  return value;
}

function FieldRow({ label, value, mono = false, wide = false }: {
  label: string;
  value: string;
  mono?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
        {label}
      </div>
      <div className={`text-xs break-words ${mono ? "font-mono" : ""}`} title={value}>
        {value}
      </div>
    </div>
  );
}

const KAIZEN_AREA_OPTIONS = [
  { value: "safety", label: "Safety" },
  { value: "quality", label: "Quality" },
  { value: "cost", label: "Cost" },
  { value: "delivery", label: "Delivery" },
  { value: "morale", label: "Morale" },
  { value: "environment", label: "Environment" },
  { value: "productivity", label: "Productivity" },
  { value: "other", label: "Other" },
];

const DEPARTMENT_OPTIONS = [
  { value: "HR", label: "HR" },
  { value: "Engineering", label: "Engineering" },
  { value: "Production", label: "Production" },
  { value: "Quality", label: "Quality" },
  { value: "Maintenance", label: "Maintenance" },
  { value: "Sales", label: "Sales" },
  { value: "Finance", label: "Finance" },
  { value: "Admin", label: "Admin" },
  { value: "Other", label: "Other" },
];

function KaizenForm({ initial, currentEmployee, canSetPoints = false, teamMembers = [], onCancel, onSubmit }: {
  initial?: Kaizen,
  currentEmployee?: any,
  // Points-related fields ("Employee Engagement Points", final "Status")
  // are filled by Admin / HR. Regular employees see them but as read-only.
  canSetPoints?: boolean,
  // Members of the current user's engagement team (self excluded) — used
  // by the Employee Contributor multi-select.
  teamMembers?: any[],
  onCancel: () => void,
  onSubmit: (data: any) => void
}) {
  // Decode the `benefits` column back into checkbox state + free-text on
  // edit so the form round-trips cleanly.
  const decodedInitial = decodeBenefits(initial?.benefits);

  const [formData, setFormData] = useState({
    // Section 1: Kaizen Info
    employeeId: currentEmployee?.id || "",
    firstName: currentEmployee?.firstName || "",
    middleName: "",
    lastName: currentEmployee?.lastName || "",
    department: currentEmployee?.department || "",
    employeeEngagementTeamName: currentEmployee?.employeeEngagementTeamName || "",
    kaizenArea: "",
    startDate: "",
    theme: initial?.title || "",
    // Section 2: Problem & Analysis
    problem: initial?.description || "",
    // Pre-fill media from the existing record so editing preserves it.
    // `referenceImage` is the legacy single-slot column; promote it into
    // beforeMedia when the new field isn't populated.
    beforeMedia: (initial as any)?.beforeMedia || (initial as any)?.referenceImage || "",
    afterMedia: (initial as any)?.afterMedia || "",
    whyAnalysis: initial?.currentState || "",
    // Section 3: Result & Benefits
    result: initial?.proposedState || "",
    benefits: decodedInitial.freeText,
    benefitChecks: decodedInitial.checked,
    standardsUpdated: decodedInitial.standards,
    employeeContributor: "",
    signature: "",
    selfie: "",
    employeeEngagementPoints: 0,
    status: initial?.status || "trial-phase",
  });

  const toggleBenefit = (value: string) => {
    setFormData((f) => ({
      ...f,
      benefitChecks: f.benefitChecks.includes(value)
        ? f.benefitChecks.filter((v) => v !== value)
        : [...f.benefitChecks, value],
    }));
  };

  const toggleStandard = (value: string) => {
    setFormData((f) => ({
      ...f,
      standardsUpdated: f.standardsUpdated.includes(value)
        ? f.standardsUpdated.filter((v) => v !== value)
        : [...f.standardsUpdated, value],
    }));
  };

  const [touched, setTouched] = useState(false);

  const errors = {
    employeeId: !formData.employeeId.trim() ? "Employee ID is required" : "",
    firstName: !formData.firstName.trim() ? "First Name is required" : "",
    lastName: !formData.lastName.trim() ? "Last Name is required" : "",
    kaizenArea: !formData.kaizenArea ? "Kaizen Area is required" : "",
    startDate: !formData.startDate ? "Start Date is required" : "",
    theme: !formData.theme.trim() ? "Theme is required" : "",
    problem: !formData.problem.trim() ? "Problem is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    // Map sectioned fields back onto the persisted Kaizen schema:
    //   theme → title, problem → description, whyAnalysis → currentState,
    //   result → proposedState. Extra metadata is preserved on the wire so
    //   future-aware backends can pick it up without breaking the current one.
    onSubmit({
      title: formData.theme,
      description: formData.problem,
      currentState: formData.whyAnalysis,
      proposedState: formData.result,
      // The `benefits` column carries the checkbox selections, the standards-
      // updated selections, and the free-text addendum. See encodeBenefits
      // for the wire format — decoded again by decodeBenefits on edit.
      benefits: encodeBenefits(formData.benefitChecks, formData.benefits, formData.standardsUpdated),
      status: formData.status,
      employeeId: formData.employeeId,
      firstName: formData.firstName,
      middleName: formData.middleName,
      lastName: formData.lastName,
      department: formData.department,
      employeeEngagementTeamName: formData.employeeEngagementTeamName,
      kaizenArea: formData.kaizenArea,
      startDate: formData.startDate,
      beforeMedia: formData.beforeMedia,
      afterMedia: formData.afterMedia,
      employeeContributor: formData.employeeContributor,
      signature: formData.signature,
      selfie: formData.selfie,
      employeeEngagementPoints: formData.employeeEngagementPoints,
    });
  };

  const showErr = (field: keyof typeof errors) => touched && errors[field];

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50/40">
        {/* Section 1: Kaizen Info */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Kaizen Info</h3>
              <p className="text-xs text-muted-foreground">Employee, area, theme, start date</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <FieldWrapper label="Employee ID" required error={showErr("employeeId") ? errors.employeeId : ""}>
              <Input
                value={formData.employeeId}
                onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                placeholder="e.g. EMP-0001"
                className={showErr("employeeId") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="First Name" required error={showErr("firstName") ? errors.firstName : ""}>
              <Input
                value={formData.firstName}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                className={showErr("firstName") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Middle Name">
              <Input value={formData.middleName} onChange={e => setFormData({ ...formData, middleName: e.target.value })} />
            </FieldWrapper>

            <FieldWrapper label="Last Name" required error={showErr("lastName") ? errors.lastName : ""}>
              <Input
                value={formData.lastName}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                className={showErr("lastName") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Department">
              <Select value={formData.department} onValueChange={v => setFormData({ ...formData, department: v })}>
                <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Employee Engagement Team Name">
              <Input
                value={formData.employeeEngagementTeamName}
                onChange={e => setFormData({ ...formData, employeeEngagementTeamName: e.target.value })}
                placeholder="Team name"
              />
            </FieldWrapper>

            <FieldWrapper label="Kaizen Area" required error={showErr("kaizenArea") ? errors.kaizenArea : ""}>
              <Select value={formData.kaizenArea} onValueChange={v => setFormData({ ...formData, kaizenArea: v })}>
                <SelectTrigger className={showErr("kaizenArea") ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {KAIZEN_AREA_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Start Date" required error={showErr("startDate") ? errors.startDate : ""}>
              <Input
                type="date"
                value={formData.startDate}
                onChange={e => setFormData({ ...formData, startDate: e.target.value })}
                className={showErr("startDate") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <div className="md:col-span-2">
              <FieldWrapper label="Theme" required error={showErr("theme") ? errors.theme : ""}>
                <Input
                  value={formData.theme}
                  onChange={e => setFormData({ ...formData, theme: e.target.value })}
                  placeholder="Kaizen theme"
                  className={showErr("theme") ? "border-red-500" : ""}
                />
              </FieldWrapper>
            </div>
          </div>
        </Card>

        {/* Section 2: Problem & Analysis */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Problem & Analysis</h3>
              <p className="text-xs text-muted-foreground">Before/after media and why-analysis</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <FieldWrapper label="Problem" required error={showErr("problem") ? errors.problem : ""}>
              <Textarea
                value={formData.problem}
                onChange={e => setFormData({ ...formData, problem: e.target.value })}
                placeholder="Problem statement"
                className={`min-h-[110px] ${showErr("problem") ? "border-red-500" : ""}`}
              />
            </FieldWrapper>

            <FieldWrapper label="Before Kaizen" hint="Take a photo or upload">
              <FileFieldStub
                value={formData.beforeMedia}
                onChange={v => setFormData({ ...formData, beforeMedia: v })}
                capture="environment"
              />
            </FieldWrapper>

            <FieldWrapper label="After Kaizen" hint="Take a photo or upload">
              <FileFieldStub
                value={formData.afterMedia}
                onChange={v => setFormData({ ...formData, afterMedia: v })}
                capture="environment"
              />
            </FieldWrapper>

            <FieldWrapper label="Why Analysis">
              <Textarea
                value={formData.whyAnalysis}
                onChange={e => setFormData({ ...formData, whyAnalysis: e.target.value })}
                placeholder="5-why / root cause"
                className="min-h-[110px]"
              />
            </FieldWrapper>
          </div>
        </Card>

        {/* Section 3: Result & Benefits */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">3</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Result & Benefits</h3>
              <p className="text-xs text-muted-foreground">Result, benefits and signatures</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <FieldWrapper label="Result">
              <Textarea
                value={formData.result}
                onChange={e => setFormData({ ...formData, result: e.target.value })}
                placeholder="Measured result"
                className="min-h-[100px]"
              />
            </FieldWrapper>

            <div className="md:col-span-2">
              <FieldWrapper label="Standard Updated" hint="Mention reference no. of document updated">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-md border p-3 bg-slate-50/50">
                  {STANDARD_UPDATED_OPTIONS.map((opt) => {
                    const checked = formData.standardsUpdated.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                          checked ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-100"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleStandard(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </FieldWrapper>
            </div>

            <div className="md:col-span-2">
              <FieldWrapper label="Benefits (please tick)">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 rounded-md border p-3 bg-slate-50/50">
                  {BENEFIT_OPTIONS.map((opt) => {
                    const checked = formData.benefitChecks.includes(opt.value);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                          checked ? "bg-green-50 ring-1 ring-green-200" : "hover:bg-slate-100"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleBenefit(opt.value)}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </FieldWrapper>
            </div>

            <div className="md:col-span-2">
              <FieldWrapper label="Benefits — Additional Notes" hint="Quantify if possible (e.g. 30% time savings)">
                <Textarea
                  value={formData.benefits}
                  onChange={e => setFormData({ ...formData, benefits: e.target.value })}
                  placeholder="Describe the benefit delivered…"
                  className="min-h-[80px]"
                />
              </FieldWrapper>
            </div>

            <FieldWrapper
              label="Employee Contributor"
              hint="Pick up to 4 team-mates who contributed to this Kaizen."
            >
              <ContributorPicker
                value={formData.employeeContributor}
                onChange={(v) => setFormData({ ...formData, employeeContributor: v })}
                teamMembers={teamMembers}
                max={4}
              />
            </FieldWrapper>

            <FieldWrapper label="Signature" hint="Draw with finger, capture, or upload">
              <FileFieldStub
                value={formData.signature}
                onChange={v => setFormData({ ...formData, signature: v })}
                placeholder="Upload signature..."
                capture="environment"
                enableDraw
              />
            </FieldWrapper>

            <FieldWrapper label="Selfie" hint="Take a selfie or upload one">
              <FileFieldStub
                value={formData.selfie}
                onChange={v => setFormData({ ...formData, selfie: v })}
                capture="user"
              />
            </FieldWrapper>

            <FieldWrapper
              label="Employee Engagement Points"
              hint={canSetPoints ? "Admin / HR only" : "Filled by Admin / HR (read-only for you)"}
            >
              <Input
                type="number"
                min={0}
                value={formData.employeeEngagementPoints}
                onChange={e => setFormData({ ...formData, employeeEngagementPoints: Number(e.target.value) || 0 })}
                readOnly={!canSetPoints}
                disabled={!canSetPoints}
                className={!canSetPoints ? "bg-muted/40 cursor-not-allowed" : ""}
                aria-readonly={!canSetPoints}
              />
            </FieldWrapper>

            <div className="md:col-span-2">
              <FieldWrapper label="Status">
                <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldWrapper>
            </div>
          </div>
        </Card>
      </div>

      <div className="border-t bg-background px-6 py-3 flex items-center justify-end gap-3 sticky bottom-0">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={touched && hasErrors}
          className={`text-white font-semibold ${touched && hasErrors ? "bg-blue-300 hover:bg-blue-300" : "bg-blue-600 hover:bg-blue-700"}`}
        >
          {touched && hasErrors ? (
            <><AlertCircle className="h-4 w-4 mr-2" /> Fix Errors</>
          ) : (
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Update Kaizen" : "Save Kaizen"}</>
          )}
        </Button>
      </div>
    </>
  );
}

function FieldWrapper({ label, required, error, hint, children }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {hint && <p className="text-[11px] text-muted-foreground -mt-1">{hint}</p>}
      {children}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

// Image upload widget for the Kaizen "Before / After Media" slots.
// Reads the selected file into a base64 `data:` URL and stores it via
// `onChange` — the same string flows through to the API and is rendered
// as <img> by the dashboard detail dialog (see employee-awards-view.tsx
// → MediaSlot). A live preview is shown so the user knows the upload
// worked.
// Multi-select for "Employee Contributor" — picks up to `max` team-mates
// from the engagement team. Selected contributors render as removable
// badges; the stored value is a comma-separated string of names so the
// existing free-text storage path keeps working.
function ContributorPicker({
  value,
  onChange,
  teamMembers,
  max = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  teamMembers: any[];
  max?: number;
}) {
  const selectedNames = (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Display name fallback chain — employee record shape varies a bit.
  const nameOf = (e: any): string =>
    e?.employeeName ||
    [e?.firstName, e?.middleName, e?.lastName].filter(Boolean).join(" ") ||
    e?.email ||
    e?.id ||
    "Unknown";

  const remaining = Math.max(0, max - selectedNames.length);
  const atLimit = remaining === 0;

  const availableMembers = teamMembers.filter(
    (e) => !selectedNames.includes(nameOf(e)),
  );

  const addMember = (name: string) => {
    if (!name || atLimit) return;
    const next = [...selectedNames, name].join(", ");
    onChange(next);
  };

  const removeMember = (name: string) => {
    const next = selectedNames.filter((n) => n !== name).join(", ");
    onChange(next);
  };

  return (
    <div className="space-y-2">
      {/* Selected badges */}
      <div className="flex flex-wrap items-center gap-1.5 min-h-[2rem]">
        {selectedNames.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No contributors added yet.</span>
        )}
        {selectedNames.map((n) => (
          <Badge
            key={n}
            variant="secondary"
            className="gap-1 pl-2 pr-1 py-1 text-xs font-medium"
          >
            {n}
            <button
              type="button"
              onClick={() => removeMember(n)}
              className="ml-1 rounded hover:bg-muted p-0.5"
              title={`Remove ${n}`}
              aria-label={`Remove ${n}`}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>

      {/* Picker */}
      <div className="flex items-center gap-2">
        <Select
          value=""
          onValueChange={addMember}
          disabled={atLimit || availableMembers.length === 0}
        >
          <SelectTrigger className="h-9 flex-1">
            <SelectValue
              placeholder={
                atLimit
                  ? `Limit reached (${max}/${max})`
                  : availableMembers.length === 0
                    ? teamMembers.length === 0
                      ? "No team members available"
                      : "All team members added"
                    : "Add a team member…"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {availableMembers.map((e) => (
              <SelectItem key={e.id} value={nameOf(e)}>
                {nameOf(e)}
                {e.department && (
                  <span className="text-muted-foreground"> · {e.department}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
          {selectedNames.length}/{max}
        </span>
      </div>
    </div>
  );
}

function FileFieldStub({ value, onChange, placeholder, capture, enableDraw }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // When set, adds a dedicated "Camera" button whose file input carries
  // the HTML `capture` attribute — mobile/tablet browsers open the
  // device camera directly instead of the file picker. "user" = front
  // camera (for selfies), "environment" = rear camera (for site photos).
  capture?: "user" | "environment";
  // When true, adds a "Draw" button that toggles an inline signature
  // pad below the input. Finger-drawn (or mouse-drawn) strokes are
  // saved as a PNG data URL, same format as the camera/upload path so
  // the receiving onChange handler stays unchanged.
  enableDraw?: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [drawOpen, setDrawOpen] = useState(false);
  // 4MB raw file → ~5.4MB base64. Keeps us under the API's 6MB cap with
  // headroom for JSON overhead.
  const MAX_BYTES = 4 * 1024 * 1024;
  const isDataUrl = value.startsWith("data:image/");
  const isExternalUrl = value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/");
  const hasPreview = isDataUrl || isExternalUrl;
  // Display label for non-image stored values (e.g. legacy filenames).
  const filenameLabel = !hasPreview && value ? value : "";

  const handleFile = (f: File) => {
    setError(null);
    if (!f.type.startsWith("image/")) {
      setError("Only image files are supported.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Image is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 4 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) onChange(result);
    };
    reader.onerror = () => setError("Could not read file.");
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-stretch border rounded-md overflow-hidden">
        <div className="flex items-center px-3 text-muted-foreground border-r bg-slate-50">
          <Paperclip className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 px-3 py-2 text-xs text-muted-foreground truncate flex items-center min-w-0">
          {hasPreview ? (
            <span className="text-foreground font-medium truncate">Image attached</span>
          ) : filenameLabel ? (
            <span className="text-foreground truncate" title={filenameLabel}>{filenameLabel}</span>
          ) : (
            <span>{placeholder || "Choose an image…"}</span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setError(null); }}
            className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 hover:bg-slate-100"
            title="Remove image"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remove image</span>
          </button>
        )}
        {enableDraw && (
          <button
            type="button"
            onClick={() => { setDrawOpen((v) => !v); setError(null); }}
            className={`flex items-center px-3 text-muted-foreground border-l bg-slate-50 hover:bg-slate-100 ${drawOpen ? "bg-slate-100" : ""}`}
            title={drawOpen ? "Close signature pad" : "Draw signature"}
            aria-pressed={drawOpen}
          >
            <Pencil className="h-3.5 w-3.5" />
            <span className="sr-only">{drawOpen ? "Close signature pad" : "Draw signature"}</span>
          </button>
        )}
        {capture && (
          <label className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 cursor-pointer hover:bg-slate-100" title="Take a photo with the camera">
            <Camera className="h-3.5 w-3.5" />
            <span className="sr-only">Take a photo</span>
            <input
              type="file"
              accept="image/*"
              capture={capture}
              aria-label="Take a photo"
              title="Take a photo"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <label className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 cursor-pointer hover:bg-slate-100" title="Upload image">
          <Upload className="h-3.5 w-3.5" />
          <span className="sr-only">Upload image</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Upload image"
            title="Upload image"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              // Reset so picking the same file again still fires onChange.
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {drawOpen && (
        <SignaturePad
          onSave={(dataUrl) => {
            onChange(dataUrl);
            setDrawOpen(false);
            setError(null);
          }}
          onCancel={() => setDrawOpen(false)}
        />
      )}

      {hasPreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Upload preview"
          className="max-h-32 rounded border bg-white object-contain"
        />
      )}

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SignaturePad — finger / pointer drawing surface that saves to a PNG data
// URL. Used by FileFieldStub when enableDraw is set (the kaizen Signature
// field). Implementation notes:
//   - Uses Pointer Events so touch and mouse share one code path.
//   - touch-action: none on the canvas prevents the browser from
//     interpreting the drag as a scroll while the user is signing.
//   - Canvas backing store is sized to devicePixelRatio so strokes look
//     crisp on retina/HiDPI screens. The CSS size stays fluid (`w-full`)
//     so the pad fits whichever column it lands in.
// ─────────────────────────────────────────────────────────────────────────────

function SignaturePad({
  onSave,
  onCancel,
}: {
  onSave: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  // Size the canvas backing store to match its CSS size × DPR so strokes
  // stay sharp on retina screens. Runs once on mount; if the container
  // resizes after mount the strokes still render correctly (just with a
  // softer edge) so we don't bother with a resize observer for now.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
  }, []);

  const pointAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = pointAt(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const pt = pointAt(e);
    const last = lastPointRef.current ?? pt;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPointRef.current = pt;
    if (isEmpty) setIsEmpty(false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // Ignore — pointer may already be released on touch cancel.
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // clearRect uses the backing store size (already scaled), so passing
    // canvas.width / .height is correct here even though we drew in CSS px.
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setIsEmpty(true);
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || isEmpty) return;
    onSave(canvas.toDataURL("image/png"));
  };

  return (
    <div className="rounded-md border bg-white p-2 space-y-2">
      <div className="text-[11px] text-muted-foreground">
        Sign below using your finger or mouse.
      </div>
      <canvas
        ref={canvasRef}
        className="w-full h-32 rounded border bg-white touch-none cursor-crosshair select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex gap-2 justify-end">
        <button
          type="button"
          onClick={clear}
          className="text-xs px-3 py-1 border rounded hover:bg-muted"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs px-3 py-1 border rounded hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isEmpty}
          className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  );
}

function Fact({ label, value, icon: Icon }: { label: string; value: string; icon?: any }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</p>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value}
      </div>
    </div>
  );
}
