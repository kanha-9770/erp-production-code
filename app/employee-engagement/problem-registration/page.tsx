"use client";

/**
 * Problem Registration — premium workspace layout.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  AlertCircle, Plus, Search, Calendar, Briefcase, Pencil, Trash2,
  CheckCircle2, AlertTriangle, Type, FileText, Tag, UserCircle,
  Info, Save, Paperclip, Upload
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
import { useEngagementReviews, ReviewCell, ReviewBanner } from "@/app/employee-engagement/components/review-status";

interface ProblemRegistration {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  registrationDate: string;
  status: 'open' | 'in-review' | 'resolved' | 'closed';
  proposedSolution: string;
  userId: string;
  employeeId: string;
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in-review", label: "In Review" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low Impact" },
  { value: "medium", label: "Medium Impact" },
  { value: "high", label: "High Impact" },
  { value: "critical", label: "Critical" },
];

const CATEGORY_OPTIONS = [
  { value: "operational", label: "Operational" },
  { value: "technical", label: "Technical" },
  { value: "process", label: "Process" },
  { value: "safety", label: "Safety" },
  { value: "quality", label: "Quality" },
  { value: "people", label: "People / HR" },
  { value: "facility", label: "Facility" },
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
  severity: string;
  category: string;
  department: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", severity: "", category: "", department: "" };

export default function ProblemRegistrationPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const visibility = useEngagementVisibility();
  const { toast } = useToast();

  const [problems, setProblems] = useState<ProblemRegistration[]>([]);
  const reviews = useEngagementReviews("Problem", problems.length);
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

  const views = useSavedViews<Filters>("problem-registrations");

  const loadProblems = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/engagement/problems", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to load problems");
      const rows: ProblemRegistration[] = json.problems ?? [];
      const allow = makeEngagementFilter<ProblemRegistration>(visibility, employeeToTeam);
      setProblems(rows.filter(allow));
    } catch (e: any) {
      toast({ title: "Failed to load problems", description: e?.message, variant: "destructive" });
      setProblems([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, visibility, employeeToTeam, toast]);

  useEffect(() => {
    if (user?.id && !visibility.loading) loadProblems();
  }, [user?.id, isAdmin, employees.length, visibility, loadProblems]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Title", type: "text" },
    { id: "description", label: "Description", type: "text" },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "severity", label: "Severity", type: "select", options: SEVERITY_OPTIONS },
    { id: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { id: "department", label: "Department", type: "select", options: DEPARTMENT_FILTER_OPTIONS },
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "middleName", label: "Middle Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "employeeEngagementTeamName", label: "Team Name", type: "text" },
    { id: "proposedSolution", label: "Proposed Solution", type: "text" },
    { id: "registrationDate", label: "Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = problems;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(p => p.status === filters.status);
    if (filters.severity) result = result.filter(p => p.severity === filters.severity);
    if (filters.category) result = result.filter(p => p.category === filters.category);
    if (filters.department) result = result.filter(p => (p as any).department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [problems, filters, conditions, filterFields]);

  const columns: ColumnDef<ProblemRegistration>[] = useMemo(() => {
    const text = (p: ProblemRegistration, key: string) => {
      const v = (p as any)[key];
      return v === null || v === undefined || v === "" ? "—" : String(v);
    };
    const plain = (p: ProblemRegistration, key: string) => <span className="text-xs truncate">{text(p, key)}</span>;

    return [
      {
        id: "title",
        header: "Problem",
        width: 300,
        pinned: true,
        cell: (p) => (
          <div className="min-w-0">
            <div className="font-medium truncate uppercase">{p.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{p.description}</div>
          </div>
        ),
      },
      {
        id: "severity",
        header: "Severity",
        width: 130,
        group: "Overview",
        cell: (p) => {
          const colors: Record<string, string> = {
            low: "bg-green-100 text-green-800",
            medium: "bg-yellow-100 text-yellow-800",
            high: "bg-orange-100 text-orange-800",
            critical: "bg-red-100 text-red-800",
          };
          return <Badge variant="outline" className={`${colors[p.severity]} text-[10px]`}>{p.severity.toUpperCase()}</Badge>;
        },
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        group: "Overview",
        cell: (p) => {
          const colors: Record<string, string> = {
            open: "bg-blue-100 text-blue-800",
            "in-review": "bg-yellow-100 text-yellow-800",
            resolved: "bg-green-100 text-green-800",
            closed: "bg-gray-100 text-gray-800",
          };
          return <Badge variant="outline" className={`${colors[p.status]} text-[10px]`}>{p.status.toUpperCase()}</Badge>;
        },
      },
      {
        id: "review",
        header: "Review",
        width: 140,
        group: "Overview",
        cell: (p) => <ReviewCell review={reviews[p.id]} />,
      },
      {
        id: "date",
        header: "Registered",
        width: 130,
        group: "Overview",
        cell: (p) => <span className="text-xs text-muted-foreground">{new Date(p.registrationDate).toLocaleDateString()}</span>,
      },

      // ── Problem Info form fields ──────────────────────────────────────
      { id: "employeeId", header: "Employee ID", width: 140, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "employeeId") },
      { id: "firstName", header: "First Name", width: 140, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "firstName") },
      { id: "middleName", header: "Middle Name", width: 140, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "middleName") },
      { id: "lastName", header: "Last Name", width: 140, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "lastName") },
      { id: "department", header: "Department", width: 140, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "department") },
      { id: "employeeEngagementTeamName", header: "Employee Engagement Team Name", width: 200, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "employeeEngagementTeamName") },
      { id: "description", header: "Description", width: 240, group: "Problem Info", defaultHidden: true, cell: (p) => <span className="text-xs truncate">{p.description || "—"}</span> },
      { id: "category", header: "Category", width: 140, group: "Problem Info", defaultHidden: true, cell: (p) => <span className="text-xs truncate">{p.category || "—"}</span> },
      { id: "proposedSolution", header: "Proposed Solution", width: 240, group: "Problem Info", defaultHidden: true, cell: (p) => <span className="text-xs truncate">{p.proposedSolution || "—"}</span> },
      { id: "media", header: "Media", width: 160, group: "Problem Info", defaultHidden: true, cell: (p) => plain(p, "media") },
      { id: "employeeEngagementPoints", header: "Employee Engagement Points", width: 180, group: "Problem Info", defaultHidden: true, align: "right", cell: (p) => plain(p, "employeeEngagementPoints") },
    ];
  }, [reviews]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this problem record?")) return;
    try {
      const res = await fetch(`/api/engagement/problems/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Delete failed");
      setProblems(problems.filter(p => p.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Problem deleted" });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <>
      <WorkspaceShell
        scope="problem-registrations"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<AlertCircle className="h-5 w-5 text-red-600" />}
              title="Problem Registration"
              subtitle={`${items.length} problem${items.length === 1 ? "" : "s"}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search problems..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && updateFilter("search", searchInput)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="problem-registrations"
                columns={columns}
                variant="dialog"
              />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Register Problem
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
              <FilterChips label="Severity" value={filters.severity} onChange={(v) => updateFilter("severity", v)} options={SEVERITY_OPTIONS} />
              <FilterChips label="Category" value={filters.category} onChange={(v) => updateFilter("category", v)} options={CATEGORY_OPTIONS} />
              <FilterChips label="Department" value={filters.department} onChange={(v) => updateFilter("department", v)} options={DEPARTMENT_FILTER_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<ProblemRegistration>
            tableId="problem-registrations"
            columns={columns}
            rows={items}
            rowId={(p) => p.id}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(p) => setSelectedId(p.id)}
          />
        }
        preview={selectedId ? <ProblemPreview id={selectedId} problems={problems} employees={employees} isAdmin={isAdmin} review={reviews[selectedId]} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} problems={problems} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Problem Registration <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <ProblemForm
            currentEmployee={currentEmployee}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (data) => {
              try {
                const res = await fetch("/api/engagement/problems", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(data),
                });
                const json = await res.json();
                if (!res.ok || !json?.success) throw new Error(json?.error ?? "Submit failed");
                setProblems([json.problem as ProblemRegistration, ...problems]);
                setCreateOpen(false);
                toast({ title: "Problem registered" });
              } catch (e: any) {
                toast({ title: "Could not register", description: e?.message, variant: "destructive" });
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Problem Registration <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          {editingId && (
            <ProblemForm
              initial={problems.find(p => p.id === editingId)}
              currentEmployee={currentEmployee}
              onCancel={() => setEditingId(null)}
              onSubmit={async (data) => {
                try {
                  const res = await fetch(`/api/engagement/problems/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.success) throw new Error(json?.error ?? "Update failed");
                  setProblems(problems.map(p => p.id === editingId ? (json.problem as ProblemRegistration) : p));
                  setEditingId(null);
                  toast({ title: "Problem updated" });
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

function PreviewHeader({ id, problems }: { id: string, problems: ProblemRegistration[] }) {
  const p = problems.find(x => x.id === id);
  if (!p) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase">{p.status}</Badge>
      <span className="font-semibold text-sm truncate uppercase">{p.title}</span>
    </div>
  );
}

function ProblemPreview({ id, problems, employees, isAdmin, review, onEdit, onDelete }: { id: string, problems: ProblemRegistration[], employees: any[], isAdmin: boolean, review?: import("@/app/employee-engagement/components/review-status").EngagementReview, onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const p = problems.find(x => x.id === id);
  if (!p) return null;

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold uppercase">{p.title}</h2>
          <Badge variant={p.severity === 'critical' ? 'destructive' : 'outline'} className="uppercase text-[10px]">{p.severity} SEVERITY</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(p.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <ReviewBanner review={review} />

      <SubmitterDetails employeeId={p.employeeId} employees={employees} isAdmin={isAdmin} submissionDate={p.registrationDate} />

      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Description</h3>
        <p className="text-sm leading-relaxed">{p.description}</p>
      </Card>

      {p.proposedSolution && (
        <Card className="p-4 space-y-3 border-l-4 border-l-green-500 bg-green-50/50">
          <h3 className="text-[11px] font-semibold text-green-700 uppercase tracking-wider">Proposed Solution</h3>
          <p className="text-sm text-green-900">{p.proposedSolution}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
        <Fact label="Registered On" value={new Date(p.registrationDate).toLocaleDateString()} icon={Calendar} />
        <Fact label="Category" value={p.category.toUpperCase()} icon={Tag} />
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

function ProblemForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: ProblemRegistration,
  currentEmployee?: any,
  onCancel: () => void,
  onSubmit: (data: any) => void
}) {
  const [formData, setFormData] = useState({
    employeeId: currentEmployee?.id || "",
    firstName: currentEmployee?.firstName || "",
    middleName: "",
    lastName: currentEmployee?.lastName || "",
    department: currentEmployee?.department || "",
    employeeEngagementTeamName: currentEmployee?.employeeEngagementTeamName || "",
    media: "",
    employeeEngagementPoints: 0,
    title: initial?.title || "",
    description: initial?.description || "",
    severity: initial?.severity || "medium",
    category: initial?.category || "operational",
    status: initial?.status || "open",
    proposedSolution: initial?.proposedSolution || "",
  });

  const [touched, setTouched] = useState(false);

  const errors = {
    employeeId: !formData.employeeId.trim() ? "Employee ID is required" : "",
    firstName: !formData.firstName.trim() ? "First Name is required" : "",
    lastName: !formData.lastName.trim() ? "Last Name is required" : "",
    title: !formData.title.trim() ? "Title is required" : "",
    description: !formData.description.trim() ? "Description is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    onSubmit({
      title: formData.title,
      description: formData.description,
      severity: formData.severity,
      category: formData.category,
      status: formData.status,
      proposedSolution: formData.proposedSolution,
      employeeId: formData.employeeId,
      firstName: formData.firstName,
      middleName: formData.middleName,
      lastName: formData.lastName,
      department: formData.department,
      employeeEngagementTeamName: formData.employeeEngagementTeamName,
      media: formData.media,
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
              <h3 className="font-semibold text-sm">Problem Info</h3>
              <p className="text-xs text-muted-foreground">Reporter, problem description and severity</p>
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
              />
            </FieldWrapper>

            <FieldWrapper label="Title" required error={showErr("title") ? errors.title : ""}>
              <Input
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                placeholder="Problem title"
                className={showErr("title") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Severity">
              <Select value={formData.severity} onValueChange={v => setFormData({ ...formData, severity: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <div className="md:col-span-2">
              <FieldWrapper label="Description" required error={showErr("description") ? errors.description : ""}>
                <Textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Problem statement"
                  className={`min-h-[110px] ${showErr("description") ? "border-red-500" : ""}`}
                />
              </FieldWrapper>
            </div>

            <FieldWrapper label="Category">
              <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <FieldWrapper label="Proposed Solution">
                <Textarea
                  value={formData.proposedSolution}
                  onChange={e => setFormData({ ...formData, proposedSolution: e.target.value })}
                  placeholder="Suggested solution / next steps"
                  className="min-h-[100px]"
                />
              </FieldWrapper>
            </div>

            <FieldWrapper label="Media">
              <FileFieldStub value={formData.media} onChange={v => setFormData({ ...formData, media: v })} />
            </FieldWrapper>

            <FieldWrapper label="Employee Engagement Points">
              <Input
                type="number"
                min={0}
                value={formData.employeeEngagementPoints}
                onChange={e => setFormData({ ...formData, employeeEngagementPoints: Number(e.target.value) || 0 })}
              />
            </FieldWrapper>
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
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Update Record" : "Save Record"}</>
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
