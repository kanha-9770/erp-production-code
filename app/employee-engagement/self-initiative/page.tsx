"use client";

/**
 * Self Initiative — premium workspace layout.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Lightbulb, Plus, Search, Calendar, Briefcase, Pencil, Trash2,
  CheckCircle2, Type, FileText, Tag, UserCircle, Clock, Save,
  AlertCircle, Info
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

interface SelfInitiative {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'planning' | 'in-progress' | 'completed' | 'on-hold';
  category: string;
  createdAt: string;
  userId: string;
  employeeId: string;
}

const STATUS_OPTIONS = [
  { value: "planning", label: "Planning" },
  { value: "in-progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on-hold", label: "On Hold" },
];

const CATEGORY_OPTIONS = [
  { value: "learning", label: "Skill Learning" },
  { value: "mentoring", label: "Mentoring Others" },
  { value: "process-improvement", label: "Process Improvement" },
  { value: "team-building", label: "Team Building" },
  { value: "innovation", label: "Product Innovation" },
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
  category: string;
  department: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", category: "", department: "" };

export default function SelfInitiativePage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const visibility = useEngagementVisibility();
  const { toast } = useToast();

  const [initiatives, setInitiatives] = useState<SelfInitiative[]>([]);
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

  const views = useSavedViews<Filters>("self-initiatives");

  const loadInitiatives = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/engagement/initiatives", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to load initiatives");
      const rows: SelfInitiative[] = json.initiatives ?? [];
      const allow = makeEngagementFilter<SelfInitiative>(visibility, employeeToTeam);
      setInitiatives(rows.filter(allow));
    } catch (e: any) {
      toast({ title: "Failed to load initiatives", description: e?.message, variant: "destructive" });
      setInitiatives([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, visibility, employeeToTeam, toast]);

  useEffect(() => {
    if (user?.id && !visibility.loading) loadInitiatives();
  }, [user?.id, isAdmin, employees.length, visibility, loadInitiatives]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Define Initiative", type: "text" },
    { id: "description", label: "Initiative Benefits", type: "text" },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "category", label: "Self Initiative Category", type: "select", options: CATEGORY_OPTIONS },
    { id: "department", label: "Department", type: "select", options: DEPARTMENT_FILTER_OPTIONS },
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "employeeEngagementTeamName", label: "Team Name", type: "text" },
    { id: "startDate", label: "Start Date", type: "date" },
    { id: "endDate", label: "End Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = initiatives;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(i => i.status === filters.status);
    if (filters.category) result = result.filter(i => i.category === filters.category);
    if (filters.department) result = result.filter(i => (i as any).department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [initiatives, filters, conditions, filterFields]);

  const columns: ColumnDef<SelfInitiative>[] = useMemo(() => {
    const text = (i: SelfInitiative, key: string) => {
      const v = (i as any)[key];
      return v === null || v === undefined || v === "" ? "—" : String(v);
    };
    const plain = (i: SelfInitiative, key: string) => <span className="text-xs truncate">{text(i, key)}</span>;

    return [
      {
        id: "title",
        header: "Initiative",
        width: 300,
        pinned: true,
        cell: (i) => (
          <div className="min-w-0">
            <div className="font-medium truncate uppercase">{i.title}</div>
            <div className="text-[11px] text-muted-foreground truncate">{i.description}</div>
          </div>
        ),
      },
      {
        id: "category",
        header: "Category",
        width: 150,
        group: "Overview",
        cell: (i) => <Badge variant="outline" className="capitalize text-[10px]">{i.category.replace('-', ' ')}</Badge>,
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        group: "Overview",
        cell: (i) => {
          const colors: Record<string, string> = {
            planning: "bg-gray-100 text-gray-800",
            "in-progress": "bg-blue-100 text-blue-800",
            completed: "bg-green-100 text-green-800",
            "on-hold": "bg-red-100 text-red-800",
          };
          return <Badge variant="outline" className={`${colors[i.status]} text-[10px]`}>{i.status.toUpperCase()}</Badge>;
        },
      },
      {
        id: "duration",
        header: "Duration",
        width: 200,
        group: "Overview",
        cell: (i) => <span className="text-xs text-muted-foreground">{new Date(i.startDate).toLocaleDateString()} — {new Date(i.endDate).toLocaleDateString()}</span>,
      },

      // ── Self Initiative form fields ───────────────────────────────────
      { id: "employeeId", header: "Employee ID", width: 140, group: "Self Initiative", defaultHidden: true, cell: (i) => plain(i, "employeeId") },
      { id: "firstName", header: "First Name", width: 140, group: "Self Initiative", defaultHidden: true, cell: (i) => plain(i, "firstName") },
      { id: "lastName", header: "Last Name", width: 140, group: "Self Initiative", defaultHidden: true, cell: (i) => plain(i, "lastName") },
      { id: "department", header: "Department", width: 140, group: "Self Initiative", defaultHidden: true, cell: (i) => plain(i, "department") },
      { id: "employeeEngagementTeamName", header: "Employee Engagement Team Name", width: 200, group: "Self Initiative", defaultHidden: true, cell: (i) => plain(i, "employeeEngagementTeamName") },
      { id: "selfInitiativeCategory", header: "Self Initiative Category", width: 180, group: "Self Initiative", defaultHidden: true, cell: (i) => <span className="text-xs truncate">{i.category || "—"}</span> },
      { id: "defineInitiative", header: "Define Initiative", width: 240, group: "Self Initiative", defaultHidden: true, cell: (i) => <span className="text-xs truncate">{i.title || "—"}</span> },
      { id: "initiativeBenefits", header: "Initiative Benefits", width: 240, group: "Self Initiative", defaultHidden: true, cell: (i) => <span className="text-xs truncate">{i.description || "—"}</span> },
      { id: "startDate", header: "Start Date", width: 130, group: "Self Initiative", defaultHidden: true, cell: (i) => <span className="text-xs text-muted-foreground">{i.startDate ? new Date(i.startDate).toLocaleDateString() : "—"}</span> },
      { id: "endDate", header: "End Date", width: 130, group: "Self Initiative", defaultHidden: true, cell: (i) => <span className="text-xs text-muted-foreground">{i.endDate ? new Date(i.endDate).toLocaleDateString() : "—"}</span> },
      { id: "employeeEngagementPoints", header: "Employee Engagement Points", width: 180, group: "Self Initiative", defaultHidden: true, align: "right", cell: (i) => plain(i, "employeeEngagementPoints") },
    ];
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this initiative?")) return;
    try {
      const res = await fetch(`/api/engagement/initiatives/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Delete failed");
      setInitiatives(initiatives.filter(i => i.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Initiative deleted" });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <>
      <WorkspaceShell
        scope="self-initiatives"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<Lightbulb className="h-5 w-5 text-amber-500" />}
              title="Self Initiative"
              subtitle={`${items.length} initiative${items.length === 1 ? "" : "s"}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search initiatives..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && updateFilter("search", searchInput)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="self-initiatives"
                columns={columns}
                variant="dialog"
              />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => { setEditingId(null); setCreateOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> New Initiative
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
              <FilterChips label="Category" value={filters.category} onChange={(v) => updateFilter("category", v)} options={CATEGORY_OPTIONS} />
              <FilterChips label="Department" value={filters.department} onChange={(v) => updateFilter("department", v)} options={DEPARTMENT_FILTER_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<SelfInitiative>
            tableId="self-initiatives"
            columns={columns}
            rows={items}
            rowId={(i) => i.id}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(i) => setSelectedId(i.id)}
          />
        }
        preview={selectedId ? <InitiativePreview id={selectedId} initiatives={initiatives} employees={employees} isAdmin={isAdmin} onEdit={(id) => { setEditingId(id); setCreateOpen(true); }} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} initiatives={initiatives} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Self Initiative <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <InitiativeForm
            initial={editingId ? initiatives.find(i => i.id === editingId) : undefined}
            currentEmployee={currentEmployee}
            onCancel={() => { setCreateOpen(false); setEditingId(null); }}
            onSubmit={async (data) => {
              try {
                if (editingId) {
                  const res = await fetch(`/api/engagement/initiatives/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.success) throw new Error(json?.error ?? "Update failed");
                  setInitiatives(initiatives.map(i => i.id === editingId ? (json.initiative as SelfInitiative) : i));
                } else {
                  const res = await fetch("/api/engagement/initiatives", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.success) throw new Error(json?.error ?? "Create failed");
                  setInitiatives([json.initiative as SelfInitiative, ...initiatives]);
                }
                setCreateOpen(false);
                setEditingId(null);
                toast({ title: editingId ? "Initiative updated" : "Initiative created" });
              } catch (e: any) {
                toast({ title: "Could not save", description: e?.message, variant: "destructive" });
              }
            }}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}

function PreviewHeader({ id, initiatives }: { id: string, initiatives: SelfInitiative[] }) {
  const i = initiatives.find(x => x.id === id);
  if (!i) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase font-bold">{i.status}</Badge>
      <span className="font-semibold text-sm truncate uppercase tracking-tight">{i.title}</span>
    </div>
  );
}

function InitiativePreview({ id, initiatives, employees, isAdmin, onEdit, onDelete }: { id: string, initiatives: SelfInitiative[], employees: any[], isAdmin: boolean, onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const i = initiatives.find(x => x.id === id);
  if (!i) return null;

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <h2 className="text-2xl font-black uppercase tracking-tighter leading-tight">{i.title}</h2>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{i.category.replace('-', ' ')}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl" onClick={() => onEdit(i.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl text-destructive" onClick={() => onDelete(i.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <SubmitterDetails employeeId={i.employeeId} employees={employees} isAdmin={isAdmin} submissionDate={i.createdAt} />

      <Card className="p-5 border-0 bg-slate-50 space-y-4 shadow-sm">
        <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Description</h3>
        <p className="text-sm font-medium leading-relaxed text-slate-700">{i.description}</p>
      </Card>

      <div className="grid grid-cols-2 gap-y-6 pt-4 border-t">
        <Fact label="Start Date" value={new Date(i.startDate).toLocaleDateString()} icon={Calendar} />
        <Fact label="Target End Date" value={new Date(i.endDate).toLocaleDateString()} icon={Calendar} />
        <Fact label="Status" value={i.status.toUpperCase()} icon={CheckCircle2} />
        <Fact label="Category" value={i.category.replace('-', ' ').toUpperCase()} icon={Tag} />
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

function InitiativeForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: SelfInitiative,
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
    selfInitiativeCategory: initial?.category || "",
    defineInitiative: initial?.title || "",
    initiativeBenefits: initial?.description || "",
    description: initial?.description || "",
    startDate: initial?.startDate || "",
    endDate: initial?.endDate || "",
    status: initial?.status || "planning",
    employeeEngagementPoints: 0,
  });

  const [touched, setTouched] = useState(false);

  const errors = {
    employeeId: !formData.employeeId.trim() ? "Employee ID is required" : "",
    firstName: !formData.firstName.trim() ? "First Name is required" : "",
    lastName: !formData.lastName.trim() ? "Last Name is required" : "",
    selfInitiativeCategory: !formData.selfInitiativeCategory ? "Self Initiative Category is required" : "",
    defineInitiative: !formData.defineInitiative.trim() ? "Define Initiative is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    // Map UI sections back onto the persisted Initiative schema:
    //   defineInitiative → title, initiativeBenefits → description.
    onSubmit({
      title: formData.defineInitiative,
      description: formData.initiativeBenefits || formData.description || formData.defineInitiative,
      startDate: formData.startDate || new Date().toISOString().slice(0, 10),
      endDate: formData.endDate || new Date().toISOString().slice(0, 10),
      category: formData.selfInitiativeCategory,
      status: formData.status,
      employeeId: formData.employeeId,
      firstName: formData.firstName,
      lastName: formData.lastName,
      department: formData.department,
      employeeEngagementTeamName: formData.employeeEngagementTeamName,
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
              <h3 className="font-semibold text-sm">Self Initiative</h3>
              <p className="text-xs text-muted-foreground">Initiative and benefits</p>
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
              />
            </FieldWrapper>

            <FieldWrapper label="Self Initiative Category" required error={showErr("selfInitiativeCategory") ? errors.selfInitiativeCategory : ""}>
              <Select
                value={formData.selfInitiativeCategory}
                onValueChange={v => setFormData({ ...formData, selfInitiativeCategory: v })}
              >
                <SelectTrigger className={showErr("selfInitiativeCategory") ? "border-red-500" : ""}>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Define Initiative" required error={showErr("defineInitiative") ? errors.defineInitiative : ""}>
              <Textarea
                value={formData.defineInitiative}
                onChange={e => setFormData({ ...formData, defineInitiative: e.target.value })}
                placeholder="Describe initiative"
                className={`min-h-[110px] ${showErr("defineInitiative") ? "border-red-500" : ""}`}
              />
            </FieldWrapper>

            <FieldWrapper label="Initiative Benefits">
              <Textarea
                value={formData.initiativeBenefits}
                onChange={e => setFormData({ ...formData, initiativeBenefits: e.target.value })}
                placeholder="Expected benefits"
                className="min-h-[110px]"
              />
            </FieldWrapper>

            <FieldWrapper label="Start Date">
              <Input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} />
            </FieldWrapper>

            <FieldWrapper label="End Date">
              <Input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} />
            </FieldWrapper>

            <FieldWrapper label="Current Status">
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as any })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Update Initiative" : "Create Initiative"}</>
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
    <div className="space-y-1.5">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 uppercase tracking-tight">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
        {value}
      </div>
    </div>
  );
}
