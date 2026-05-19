"use client";

/**
 * Self Target — premium workspace layout.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Target, Plus, Search, Calendar, Briefcase, Pencil, Trash2,
  CheckCircle2, Type, FileText, Zap, UserCircle, Clock,
  AlertCircle, Info, Save
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

interface SelfTarget {
  id: string;
  title: string;
  description: string;
  targetDate: string;
  status: 'not-started' | 'in-progress' | 'completed';
  progress: number;
  createdAt: string;
  userId: string;
  employeeId: string;
}

const STATUS_OPTIONS = [
  { value: "not-started", label: "Not Started" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

const TARGET_MONTH_FILTER_OPTIONS = [
  { value: "january", label: "January" },
  { value: "february", label: "February" },
  { value: "march", label: "March" },
  { value: "april", label: "April" },
  { value: "may", label: "May" },
  { value: "june", label: "June" },
  { value: "july", label: "July" },
  { value: "august", label: "August" },
  { value: "september", label: "September" },
  { value: "october", label: "October" },
  { value: "november", label: "November" },
  { value: "december", label: "December" },
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
  targetMonth: string;
  department: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", targetMonth: "", department: "" };

export default function SelfTargetPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const visibility = useEngagementVisibility();
  const { toast } = useToast();

  const [targets, setTargets] = useState<SelfTarget[]>([]);
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

  const employeeToTeam = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of employees) m.set(e.id, (e as any).engagementTeamId ?? null);
    return m;
  }, [employees]);

  const views = useSavedViews<Filters>("self-targets");

  const loadTargets = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/engagement/targets", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to load targets");
      const rows: SelfTarget[] = json.targets ?? [];
      const allow = makeEngagementFilter<SelfTarget>(visibility, employeeToTeam);
      setTargets(rows.filter(allow));
    } catch (e: any) {
      toast({ title: "Failed to load targets", description: e?.message, variant: "destructive" });
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, visibility, employeeToTeam, toast]);

  useEffect(() => {
    if (user?.id && !visibility.loading) loadTargets();
  }, [user?.id, isAdmin, employees.length, visibility, loadTargets]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Target", type: "text" },
    { id: "description", label: "Description", type: "text" },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "targetMonth", label: "Target Month", type: "select", options: TARGET_MONTH_FILTER_OPTIONS },
    { id: "department", label: "Department", type: "select", options: DEPARTMENT_FILTER_OPTIONS },
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "employeeEngagementTeamName", label: "Team Name", type: "text" },
    { id: "targetDate", label: "Target Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = targets;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(t => t.status === filters.status);
    if (filters.targetMonth) result = result.filter(t => (t as any).targetMonth === filters.targetMonth);
    if (filters.department) result = result.filter(t => (t as any).department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [targets, filters, conditions, filterFields]);

  const columns: ColumnDef<SelfTarget>[] = useMemo(() => {
    const text = (t: SelfTarget, key: string) => {
      const v = (t as any)[key];
      return v === null || v === undefined || v === "" ? "—" : String(v);
    };
    const plain = (t: SelfTarget, key: string) => <span className="text-xs truncate">{text(t, key)}</span>;

    return [
      {
        id: "title",
        header: "Goal / Target",
        width: 300,
        pinned: true,
        cell: (t) => (
          <div className="min-w-0">
            <div className="font-medium truncate uppercase">{t.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{t.description}</div>
          </div>
        ),
      },
      {
        id: "progress",
        header: "Progress",
        width: 150,
        group: "Overview",
        cell: (t) => (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span>{t.progress}%</span>
            </div>
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
               <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${t.progress}%` }} />
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        group: "Overview",
        cell: (t) => {
          const colors: Record<string, string> = {
            "not-started": "bg-gray-100 text-gray-800",
            "in-progress": "bg-blue-100 text-blue-800",
            completed: "bg-green-100 text-green-800",
          };
          return <Badge variant="outline" className={`${colors[t.status]} text-[10px]`}>{t.status.toUpperCase()}</Badge>;
        },
      },
      {
        id: "date",
        header: "Target Date",
        width: 130,
        group: "Overview",
        cell: (t) => <span className="text-xs text-muted-foreground">{new Date(t.targetDate).toLocaleDateString()}</span>,
      },

      // ── Self Target form fields ───────────────────────────────────────
      { id: "employeeId", header: "Employee ID", width: 140, group: "Self Target", defaultHidden: true, cell: (t) => plain(t, "employeeId") },
      { id: "firstName", header: "First Name", width: 140, group: "Self Target", defaultHidden: true, cell: (t) => plain(t, "firstName") },
      { id: "lastName", header: "Last Name", width: 140, group: "Self Target", defaultHidden: true, cell: (t) => plain(t, "lastName") },
      { id: "department", header: "Department", width: 140, group: "Self Target", defaultHidden: true, cell: (t) => plain(t, "department") },
      { id: "employeeEngagementTeamName", header: "Employee Engagement Team Name", width: 200, group: "Self Target", defaultHidden: true, cell: (t) => plain(t, "employeeEngagementTeamName") },
      { id: "targetMonth", header: "Target Month", width: 130, group: "Self Target", defaultHidden: true, cell: (t) => plain(t, "targetMonth") },
      { id: "target", header: "Target", width: 240, group: "Self Target", defaultHidden: true, cell: (t) => <span className="text-xs truncate">{t.title || "—"}</span> },
      { id: "description", header: "Description", width: 240, group: "Self Target", defaultHidden: true, cell: (t) => <span className="text-xs truncate">{t.description || "—"}</span> },
      { id: "employeeEngagementPoints", header: "Employee Engagement Points", width: 180, group: "Self Target", defaultHidden: true, align: "right", cell: (t) => plain(t, "employeeEngagementPoints") },
    ];
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this target?")) return;
    try {
      const res = await fetch(`/api/engagement/targets/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Delete failed");
      setTargets(targets.filter(t => t.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Target deleted" });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <>
      <WorkspaceShell
        scope="self-targets"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<Target className="h-5 w-5 text-blue-600" />}
              title="Self Target"
              subtitle={`${items.length} target${items.length === 1 ? "" : "s"}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search targets..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && updateFilter("search", searchInput)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="self-targets"
                columns={columns}
                variant="dialog"
              />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> New Target
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
              <FilterChips label="Target Month" value={filters.targetMonth} onChange={(v) => updateFilter("targetMonth", v)} options={TARGET_MONTH_FILTER_OPTIONS} />
              <FilterChips label="Department" value={filters.department} onChange={(v) => updateFilter("department", v)} options={DEPARTMENT_FILTER_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<SelfTarget>
            tableId="self-targets"
            columns={columns}
            rows={items}
            rowId={(t) => t.id}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(t) => setSelectedId(t.id)}
          />
        }
        preview={selectedId ? <TargetPreview id={selectedId} targets={targets} employees={employees} isAdmin={isAdmin} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} targets={targets} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Self Target <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <TargetForm
            currentEmployee={currentEmployee}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (data) => {
              try {
                const res = await fetch("/api/engagement/targets", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(data),
                });
                const json = await res.json();
                if (!res.ok || !json?.success) throw new Error(json?.error ?? "Create failed");
                setTargets([json.target as SelfTarget, ...targets]);
                setCreateOpen(false);
                toast({ title: "Target created" });
              } catch (e: any) {
                toast({ title: "Could not create", description: e?.message, variant: "destructive" });
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Self Target <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          {editingId && (
            <TargetForm
              initial={targets.find(t => t.id === editingId)}
              currentEmployee={currentEmployee}
              onCancel={() => setEditingId(null)}
              onSubmit={async (data) => {
                try {
                  const res = await fetch(`/api/engagement/targets/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.success) throw new Error(json?.error ?? "Update failed");
                  setTargets(targets.map(t => t.id === editingId ? (json.target as SelfTarget) : t));
                  setEditingId(null);
                  toast({ title: "Target updated" });
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

function PreviewHeader({ id, targets }: { id: string, targets: SelfTarget[] }) {
  const t = targets.find(x => x.id === id);
  if (!t) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase">{t.status}</Badge>
      <span className="font-semibold text-sm truncate uppercase">{t.title}</span>
    </div>
  );
}

function TargetPreview({ id, targets, employees, isAdmin, onEdit, onDelete }: { id: string, targets: SelfTarget[], employees: any[], isAdmin: boolean, onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const t = targets.find(x => x.id === id);
  if (!t) return null;

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold uppercase">{t.title}</h2>
          <div className="flex items-center gap-4 pt-1">
             <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600">
                <Zap className="h-3.5 w-3.5 fill-blue-600" /> {t.progress}% PROGRESS
             </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(t.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(t.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <SubmitterDetails employeeId={t.employeeId} employees={employees} isAdmin={isAdmin} submissionDate={t.createdAt} />

      <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full transition-all" style={{ width: `${t.progress}%` }} />
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Target Details</h3>
        <p className="text-sm leading-relaxed">{t.description}</p>
      </Card>

      <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
        <Fact label="Target Date" value={new Date(t.targetDate).toLocaleDateString()} icon={Calendar} />
        <Fact label="Status" value={t.status.toUpperCase()} icon={CheckCircle2} />
      </div>
    </div>
  );
}

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

const TARGET_MONTH_OPTIONS = [
  { value: "january", label: "January" },
  { value: "february", label: "February" },
  { value: "march", label: "March" },
  { value: "april", label: "April" },
  { value: "may", label: "May" },
  { value: "june", label: "June" },
  { value: "july", label: "July" },
  { value: "august", label: "August" },
  { value: "september", label: "September" },
  { value: "october", label: "October" },
  { value: "november", label: "November" },
  { value: "december", label: "December" },
];

function TargetForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: SelfTarget,
  currentEmployee?: any,
  onCancel: () => void,
  onSubmit: (data: any) => void
}) {
  const [formData, setFormData] = useState({
    employeeId: currentEmployee?.id || "",
    firstName: currentEmployee?.firstName || "",
    lastName: currentEmployee?.lastName || "",
    department: currentEmployee?.department || "",
    employeeEngagementTeamName: currentEmployee?.employeeEngagementTeamName || "",
    targetMonth: "",
    target: initial?.title || "",
    description: initial?.description || "",
    targetDate: initial?.targetDate || "",
    status: initial?.status || "not-started",
    progress: initial?.progress || 0,
    employeeEngagementPoints: 0,
  });

  const [touched, setTouched] = useState(false);

  const errors = {
    employeeId: !formData.employeeId.trim() ? "Employee ID is required" : "",
    firstName: !formData.firstName.trim() ? "First Name is required" : "",
    lastName: !formData.lastName.trim() ? "Last Name is required" : "",
    targetMonth: !formData.targetMonth ? "Target Month is required" : "",
    target: !formData.target.trim() ? "Target is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    // Map sectioned fields onto persisted Target schema: target → title.
    onSubmit({
      title: formData.target,
      description: formData.description || formData.target,
      targetDate: formData.targetDate || new Date().toISOString().slice(0, 10),
      status: formData.status,
      progress: formData.progress,
      employeeId: formData.employeeId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      department: formData.department,
      employeeEngagementTeamName: formData.employeeEngagementTeamName,
      targetMonth: formData.targetMonth,
      employeeEngagementPoints: formData.employeeEngagementPoints,
    });
  };

  const showErr = (field: keyof typeof errors) => touched && errors[field];

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50/40">
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Self Target</h3>
              <p className="text-xs text-muted-foreground">Monthly self-defined target</p>
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

            <FieldWrapper label="Target Month" required error={showErr("targetMonth") ? errors.targetMonth : ""}>
              <Select value={formData.targetMonth} onValueChange={v => setFormData({ ...formData, targetMonth: v })}>
                <SelectTrigger className={showErr("targetMonth") ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_MONTH_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Target" required error={showErr("target") ? errors.target : ""}>
              <Textarea
                value={formData.target}
                onChange={e => setFormData({ ...formData, target: e.target.value })}
                placeholder="Target details"
                className={`min-h-[110px] ${showErr("target") ? "border-red-500" : ""}`}
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

            <FieldWrapper label="Target Date">
              <Input
                type="date"
                value={formData.targetDate}
                onChange={e => setFormData({ ...formData, targetDate: e.target.value })}
              />
            </FieldWrapper>

            <FieldWrapper label="Status">
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <div className="md:col-span-2">
              <FieldWrapper label={`Progress (${formData.progress}%)`}>
                <Input
                  type="range"
                  min={0}
                  max={100}
                  value={formData.progress}
                  onChange={e => setFormData({ ...formData, progress: parseInt(e.target.value) || 0 })}
                />
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
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Update Target" : "Create Target"}</>
          )}
        </Button>
      </div>
    </>
  );
}

function FieldWrapper({ label, required, error, children }: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      {children}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="h-3 w-3" /> {error}
        </p>
      )}
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
