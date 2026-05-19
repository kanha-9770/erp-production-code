"use client";

/**
 * Kaizen — premium workspace layout.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  TrendingUp, Plus, Search, Calendar, Briefcase, Pencil, Trash2,
  ThumbsUp, CheckCircle2, Lightbulb, Zap, Type, FileText, Layout,
  ArrowRight, Save, X, UserCircle, AlertCircle, Info, Paperclip, Upload
} from "lucide-react";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  FilterChips, ActiveFilterPills,
  ViewsBar, useSavedViews,
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
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

interface Kaizen {
  id: string;
  title: string;
  description: string;
  currentState: string;
  proposedState: string;
  benefits: string;
  status: 'idea' | 'approved' | 'in-implementation' | 'implemented';
  submissionDate: string;
  votes: number;
  hasVoted: boolean;
  employeeId: string;
}

const STATUS_OPTIONS = [
  { value: "idea", label: "Initial Idea" },
  { value: "approved", label: "Approved" },
  { value: "in-implementation", label: "In Implementation" },
  { value: "implemented", label: "Implemented" },
];

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
        width: 150,
        group: "Overview",
        cell: (k) => {
          const colors: Record<string, string> = {
            idea: "bg-gray-100 text-gray-800",
            approved: "bg-blue-100 text-blue-800",
            "in-implementation": "bg-yellow-100 text-yellow-800",
            implemented: "bg-green-100 text-green-800",
          };
          return <Badge variant="outline" className={`${colors[k.status]} text-[10px]`}>{k.status.replace('-', ' ').toUpperCase()}</Badge>;
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
      { id: "beforeMedia", header: "Before Media", width: 160, group: "Problem & Analysis", defaultHidden: true, cell: (k) => plain(k, "beforeMedia") },
      { id: "afterMedia", header: "After Media", width: 160, group: "Problem & Analysis", defaultHidden: true, cell: (k) => plain(k, "afterMedia") },
      { id: "currentState", header: "Why Analysis", width: 240, group: "Problem & Analysis", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.currentState || "—"}</span> },

      // ── Section 3: Result & Benefits ──────────────────────────────────
      { id: "proposedState", header: "Result", width: 240, group: "Result & Benefits", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.proposedState || "—"}</span> },
      { id: "benefits", header: "Benefits", width: 240, group: "Result & Benefits", defaultHidden: true, cell: (k) => <span className="text-xs truncate">{k.benefits || "—"}</span> },
      { id: "employeeContributor", header: "Employee Contributor", width: 180, group: "Result & Benefits", defaultHidden: true, cell: (k) => plain(k, "employeeContributor") },
      { id: "signature", header: "Signature", width: 160, group: "Result & Benefits", defaultHidden: true, cell: (k) => plain(k, "signature") },
      { id: "selfie", header: "Selfie", width: 160, group: "Result & Benefits", defaultHidden: true, cell: (k) => plain(k, "selfie") },
      { id: "employeeEngagementPoints", header: "Employee Engagement Points", width: 180, group: "Result & Benefits", defaultHidden: true, align: "right", cell: (k) => plain(k, "employeeEngagementPoints") },
    ];
  }, []);

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
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search kaizens..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && updateFilter("search", searchInput)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="kaizens"
                columns={columns}
                variant="dialog"
              />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> New Kaizen
              </Button>
            </WorkspaceHeader>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-3">
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

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
              <FilterChips label="Status" value={filters.status} onChange={(v) => updateFilter("status", v)} options={STATUS_OPTIONS} />
              <FilterChips label="Kaizen Area" value={filters.kaizenArea} onChange={(v) => updateFilter("kaizenArea", v)} options={KAIZEN_AREA_FILTER_OPTIONS} />
              <FilterChips label="Department" value={filters.department} onChange={(v) => updateFilter("department", v)} options={DEPARTMENT_FILTER_OPTIONS} />
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
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(k) => setSelectedId(k.id)}
          />
        }
        preview={selectedId ? <KaizenPreview id={selectedId} kaizens={kaizens} employees={employees} isAdmin={isAdmin} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} onVote={handleVote} /> : null}
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
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase">{k.status}</Badge>
      <span className="font-semibold text-sm truncate uppercase">{k.title}</span>
    </div>
  );
}

function KaizenPreview({ id, kaizens, employees, isAdmin, onEdit, onDelete, onVote }: { id: string, kaizens: Kaizen[], employees: any[], isAdmin: boolean, onEdit: (id: string) => void, onDelete: (id: string) => void, onVote: (id: string) => void }) {
  const k = kaizens.find(x => x.id === id);
  if (!k) return null;

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold uppercase">{k.title}</h2>
          <div className="flex items-center gap-2">
            <Button variant={k.hasVoted ? 'default' : 'outline'} size="sm" className="h-7 gap-1.5" onClick={() => onVote(k.id)}>
              <ThumbsUp className="h-3.5 w-3.5" /> {k.votes}
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(k.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(k.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <SubmitterDetails employeeId={k.employeeId} employees={employees} isAdmin={isAdmin} submissionDate={k.submissionDate} />

      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description</h3>
        <p className="text-sm leading-relaxed">{k.description}</p>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3 bg-amber-50/30 border-amber-100">
          <h3 className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider flex items-center gap-1.5"><Layout className="h-3 w-3" /> Current State</h3>
          <p className="text-xs">{k.currentState}</p>
        </Card>
        <Card className="p-4 space-y-3 bg-blue-50/30 border-blue-100">
          <h3 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider flex items-center gap-1.5"><Lightbulb className="h-3 w-3" /> Proposed State</h3>
          <p className="text-xs">{k.proposedState}</p>
        </Card>
      </div>

      <Card className="p-4 space-y-3 border-l-4 border-l-green-500 bg-green-50/50">
        <h3 className="text-[11px] font-semibold text-green-700 uppercase tracking-wider flex items-center gap-1.5"><Zap className="h-3 w-3" /> Benefits</h3>
        <p className="text-sm">{k.benefits}</p>
      </Card>

      <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
        <Fact label="Submitted On" value={new Date(k.submissionDate).toLocaleDateString()} icon={Calendar} />
        <Fact label="Status" value={k.status.toUpperCase()} icon={CheckCircle2} />
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

function KaizenForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: Kaizen,
  currentEmployee?: any,
  onCancel: () => void,
  onSubmit: (data: any) => void
}) {
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
    beforeMedia: "",
    afterMedia: "",
    whyAnalysis: initial?.currentState || "",
    // Section 3: Result & Benefits
    result: initial?.proposedState || "",
    benefits: initial?.benefits || "",
    employeeContributor: "",
    signature: "",
    selfie: "",
    employeeEngagementPoints: 0,
    status: initial?.status || "idea",
  });

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
      benefits: formData.benefits,
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

            <FieldWrapper label="Before Media">
              <FileFieldStub
                value={formData.beforeMedia}
                onChange={v => setFormData({ ...formData, beforeMedia: v })}
              />
            </FieldWrapper>

            <FieldWrapper label="After Media">
              <FileFieldStub
                value={formData.afterMedia}
                onChange={v => setFormData({ ...formData, afterMedia: v })}
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

            <FieldWrapper label="Benefits">
              <Textarea
                value={formData.benefits}
                onChange={e => setFormData({ ...formData, benefits: e.target.value })}
                placeholder="Benefits delivered"
                className="min-h-[100px]"
              />
            </FieldWrapper>

            <FieldWrapper label="Employee Contributor">
              <Input
                value={formData.employeeContributor}
                onChange={e => setFormData({ ...formData, employeeContributor: e.target.value })}
                placeholder="Other contributors"
              />
            </FieldWrapper>

            <FieldWrapper label="Signature" hint="Signature">
              <FileFieldStub
                value={formData.signature}
                onChange={v => setFormData({ ...formData, signature: v })}
                placeholder="Upload signature..."
              />
            </FieldWrapper>

            <FieldWrapper label="Selfie" hint="Selfie of contributor">
              <FileFieldStub
                value={formData.selfie}
                onChange={v => setFormData({ ...formData, selfie: v })}
              />
            </FieldWrapper>

            <FieldWrapper label="Employee Engagement Points">
              <Input
                type="number"
                min={0}
                value={formData.employeeEngagementPoints}
                onChange={e => setFormData({ ...formData, employeeEngagementPoints: Number(e.target.value) || 0 })}
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

function FileFieldStub({ value, onChange, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-stretch border rounded-md overflow-hidden">
      <div className="flex items-center px-3 text-muted-foreground border-r bg-slate-50">
        <Paperclip className="h-3.5 w-3.5" />
      </div>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder || "Choose files..."}
        className="border-0 rounded-none focus-visible:ring-0"
      />
      <label className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 cursor-pointer hover:bg-slate-100" title="Upload file">
        <Upload className="h-3.5 w-3.5" />
        <span className="sr-only">Upload file</span>
        <input
          type="file"
          aria-label="Upload file"
          title="Upload file"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onChange(f.name);
          }}
        />
      </label>
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
