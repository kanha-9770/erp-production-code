"use client";

/**
 * Key Result Areas (KRA) — Premium Workspace Layout.
 * Tracks measurable objectives, goal weighting, and quarterly progress.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Target, Plus, Search, Pencil, Trash2, TrendingUp, AlertTriangle,
  CheckCircle2, Calendar, User, Briefcase, Percent, Zap, Info,
  ArrowRight, BarChart3, Flag, Layers, AlertCircle, Save
} from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetEmployeeListQuery } from "@/lib/api/employees";
import { SubmitterDetails } from "@/components/employee-engagement/submitter-details";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";

// --- Types & Constants ---

type KraStatus = "DRAFT" | "ACTIVE" | "ACHIEVED" | "AT_RISK" | "MISSED";
type Period = "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL";

interface Kra {
  id: string;
  employee: string;
  // Employee identification fields (parallel to engagement module).
  employeeId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  department?: string;
  employeeEngagementTeamName?: string;
  objective: string;
  weight: number; // percentage
  target: string;
  actual: string;
  progress: number; // 0-100
  period: Period;
  year: number;
  status: KraStatus;
  notes: string;
}

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "ACTIVE", label: "Active" },
  { value: "ACHIEVED", label: "Achieved" },
  { value: "AT_RISK", label: "At Risk" },
  { value: "MISSED", label: "Missed" },
];

const PERIOD_OPTIONS = [
  { value: "Q1", label: "Q1" }, { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" }, { value: "Q4", label: "Q4" },
  { value: "ANNUAL", label: "Annual" },
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

const STORAGE_KEY = "performance-kra:v1";

const SEED: Kra[] = [
  {
    id: "KRA-0001",
    employee: "Riya Sharma",
    objective: "Reduce average ticket resolution time by 25%",
    weight: 30,
    target: "≤ 4 hours",
    actual: "4.6 hours",
    progress: 78,
    period: "Q1",
    year: 2024,
    status: "ACTIVE",
    notes: "Tracked via Zendesk export",
  },
  {
    id: "KRA-0002",
    employee: "Arjun Mehta",
    objective: "Close 8 enterprise deals worth ₹50L+ each",
    weight: 40,
    target: "8 deals",
    actual: "8 deals",
    progress: 100,
    period: "Q1",
    year: 2024,
    status: "ACHIEVED",
    notes: "Closed last deal on 28 Mar",
  },
  {
    id: "KRA-0003",
    employee: "Priya Kapoor",
    objective: "Ship the new payroll module to GA",
    weight: 35,
    target: "GA by 31 Mar",
    actual: "Beta only",
    progress: 55,
    period: "Q1",
    year: 2024,
    status: "AT_RISK",
    notes: "Tax compliance review pending",
  },
];

const EMPTY: Kra = {
  id: "", employee: "", employeeId: "", firstName: "", middleName: "", lastName: "",
  department: "", employeeEngagementTeamName: "",
  objective: "", weight: 0, target: "", actual: "",
  progress: 0, period: "Q1", year: new Date().getFullYear(), status: "DRAFT", notes: ""
};

// --- Main Component ---

export default function KraPage() {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const { data: empData } = useGetEmployeeListQuery();
  const employees = empData?.employees ?? [];
  const currentEmployee = employees.find(e => e.userId === user?.id);

  const [items, setItems] = useState<Kra[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [filters, setFilters] = useState({ search: "", period: "", status: "", department: "" });
  const [searchInput, setSearchInput] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const views = useSavedViews<typeof filters>("performance-kra");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
      else setItems(SEED);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loading]);

  const filterFields: FilterField[] = useMemo(() => [
    { id: "employee", label: "Employee", type: "text" },
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "department", label: "Department", type: "select", options: DEPARTMENT_OPTIONS },
    { id: "employeeEngagementTeamName", label: "Team Name", type: "text" },
    { id: "objective", label: "Objective", type: "text" },
    { id: "target", label: "Target Metric", type: "text" },
    { id: "actual", label: "Actual Result", type: "text" },
    { id: "period", label: "Period", type: "select", options: PERIOD_OPTIONS },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "weight", label: "Weight", type: "number" },
    { id: "progress", label: "Progress", type: "number" },
    { id: "year", label: "Year", type: "number" },
  ], []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(k =>
        k.employee.toLowerCase().includes(q) ||
        k.id.toLowerCase().includes(q) ||
        k.objective.toLowerCase().includes(q) ||
        (k.employeeId?.toLowerCase().includes(q) ?? false)
      );
    }
    if (filters.period) result = result.filter(k => k.period === filters.period);
    if (filters.status) result = result.filter(k => k.status === filters.status);
    if (filters.department) result = result.filter(k => k.department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [items, filters, conditions, filterFields]);

  const columns: ColumnDef<Kra>[] = useMemo(() => [
    {
      id: "id",
      header: "KRA ID",
      width: 120,
      pinned: true,
      cell: (k) => <span className="font-mono text-[11px] font-bold text-muted-foreground uppercase">{k.id}</span>,
    },
    {
      id: "employee",
      header: "Employee / Goal",
      width: 320,
      cell: (k) => (
        <div className="min-w-0">
           <div className="font-bold truncate uppercase text-[12px]">{k.employee}</div>
           <div className="text-[10px] text-muted-foreground truncate uppercase flex items-center gap-1 font-medium">
              <Target className="h-3 w-3" /> {k.objective}
           </div>
        </div>
      ),
    },
    {
      id: "weight",
      header: "Weight",
      width: 100,
      cell: (k) => <div className="font-bold text-xs uppercase tracking-tight">{k.weight}%</div>,
    },
    {
      id: "progress",
      header: "Real-time Progress",
      width: 180,
      cell: (k) => (
        <div className="space-y-1.5">
           <div className="flex items-center justify-between text-[10px] font-black uppercase">
              <span>{k.progress}% Complete</span>
           </div>
           <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all rounded-full ${k.status === 'AT_RISK' ? 'bg-amber-500' : k.status === 'MISSED' ? 'bg-red-500' : 'bg-emerald-500'}`} 
                style={{ width: `${k.progress}%` }} 
              />
           </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      cell: (k) => {
        const colors: Record<string, string> = {
          DRAFT: "bg-slate-100 text-slate-800",
          ACTIVE: "bg-blue-100 text-blue-800",
          ACHIEVED: "bg-emerald-100 text-emerald-800",
          AT_RISK: "bg-amber-100 text-amber-800",
          MISSED: "bg-red-100 text-red-800",
        };
        return <Badge variant="outline" className={`${colors[k.status]} text-[10px] font-bold uppercase`}>{k.status.replace('_', ' ')}</Badge>;
      },
    },
  ], []);

  const handleSave = (draft: Kra) => {
    if (editingId) {
      setItems(items.map(i => i.id === editingId ? draft : i));
      toast({ title: "KRA Updated" });
    } else {
      const newId = `KRA-${String(items.length + 1).padStart(4, '0')}`;
      setItems([{ ...draft, id: newId }, ...items]);
      toast({ title: "KRA Added" });
    }
    setFormOpen(false);
    setEditingId(null);
  };

  const handleDelete = () => {
    if (!deletingId) return;
    setItems(items.filter(i => i.id !== deletingId));
    if (selectedId === deletingId) setSelectedId(null);
    setDeletingId(null);
    toast({ title: "KRA Deleted", variant: "destructive" });
  };

  return (
    <>
      <WorkspaceShell
        scope="performance-kra"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<Target className="h-5 w-5 text-blue-600" />}
              title="Key Result Areas (KRA)"
              subtitle={`${filteredItems.length} objectives defined`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search objective, employee..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setFilters(f => ({ ...f, search: searchInput }))}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="performance-kra"
                columns={columns}
                variant="dialog"
              />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => { setEditingId(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> New KRA
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
                   else { setFilters({ search: "", period: "", status: "", department: "" }); setSearchInput(""); }
                }}
                onSave={(name) => views.save(name, filters)}
                onDelete={views.remove}
                isDirty={JSON.stringify(views.views.find(v => v.id === views.activeId)?.filters ?? { search: "", period: "", status: "", department: "" }) !== JSON.stringify(filters)}
              />
            </div>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
              <FilterChips label="Period" value={filters.period} onChange={(v) => setFilters(f => ({ ...f, period: v }))} options={PERIOD_OPTIONS} />
              <FilterChips label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={STATUS_OPTIONS} />
              <FilterChips label="Department" value={filters.department} onChange={(v) => setFilters(f => ({ ...f, department: v }))} options={DEPARTMENT_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters({ search: "", period: "", status: "", department: "" }); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<Kra>
            tableId="performance-kra"
            columns={columns}
            rows={filteredItems}
            rowId={(k) => k.id}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(k) => setSelectedId(k.id)}
          />
        }
        preview={selectedId ? (
          <KraPreview
            id={selectedId}
            items={items}
            employees={employees}
            isAdmin={isAdmin}
            onEdit={(id) => { setEditingId(id); setFormOpen(true); }}
            onDelete={(id) => setDeletingId(id)}
          />
        ) : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} items={items} /> : null}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2 uppercase tracking-tight font-black">
              KRA <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <KraForm
            initial={editingId ? items.find(i => i.id === editingId) : undefined}
            currentEmployee={currentEmployee}
            onCancel={() => setFormOpen(false)}
            onSubmit={handleSave}
          />
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deletingId} onOpenChange={(o) => !o && setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove KRA objective?</AlertDialogTitle>
            <AlertDialogDescription>This will permanently delete the goal definition and its progress tracking. This action is irreversible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete KRA</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PreviewHeader({ id, items }: { id: string, items: Kra[] }) {
  const k = items.find(x => x.id === id);
  if (!k) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase font-bold">{k.id}</Badge>
      <span className="font-bold text-sm truncate uppercase tracking-tight">{k.employee}</span>
    </div>
  );
}

function KraPreview({ id, items, employees, isAdmin, onEdit, onDelete }: { id: string, items: Kra[], employees: any[], isAdmin: boolean, onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const k = items.find(x => x.id === id);
  if (!k) return null;

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
           <h2 className="text-3xl font-black uppercase tracking-tighter leading-tight">{k.employee}</h2>
           <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.1em]">{k.period} {k.year} GOAL</Badge>
              <div className="h-1 w-1 rounded-full bg-slate-300" />
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-tight">
                 <Percent className="h-3.5 w-3.5" /> Weight: {k.weight}% of Total Performance
              </div>
           </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-2xl" onClick={() => onEdit(k.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-2xl text-destructive" onClick={() => onDelete(k.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <SubmitterDetails employeeId={k.employeeId ?? ""} employees={employees} isAdmin={isAdmin} />

      <Card className="p-6 border-0 bg-slate-900 text-white space-y-4 shadow-2xl relative overflow-hidden">
         <div className="flex justify-between items-center relative z-10">
            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Live Progress Tracking</span>
            <span className="text-3xl font-black text-emerald-400">{k.progress}%</span>
         </div>
         <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative z-10">
            <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${k.progress}%` }} />
         </div>
         <div className="flex justify-between items-end relative z-10">
            <div className="space-y-1">
               <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Objective Details</span>
               <p className="text-sm font-medium leading-relaxed">{k.objective}</p>
            </div>
            <BarChart3 className="h-12 w-12 text-white/10 absolute -bottom-4 -right-2" />
         </div>
      </Card>

      <div className="grid grid-cols-2 gap-4">
         <Card className="p-5 border-0 bg-slate-50 flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Target Outcome</span>
            <div className="flex items-center gap-3">
               <div className="p-2 rounded-xl bg-white shadow-sm text-blue-600"><Flag className="h-4 w-4" /></div>
               <span className="text-lg font-black uppercase tracking-tight">{k.target || "NOT DEFINED"}</span>
            </div>
         </Card>
         <Card className="p-5 border-0 bg-slate-50 flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Actual Achievement</span>
            <div className="flex items-center gap-3">
               <div className="p-2 rounded-xl bg-white shadow-sm text-emerald-600"><Zap className="h-4 w-4" /></div>
               <span className="text-lg font-black uppercase tracking-tight">{k.actual || "PENDING"}</span>
            </div>
         </Card>
      </div>

      <div className="space-y-6">
         <div className="space-y-3">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
               <Layers className="h-3.5 w-3.5" /> Additional Notes & Context
            </h3>
            <p className="text-sm font-medium leading-relaxed text-slate-700 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 italic">
               "{k.notes || "No strategic notes provided for this objective yet. Click edit to add context."}"
            </p>
         </div>
      </div>
    </div>
  );
}

function KraForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: Kra;
  currentEmployee?: any;
  onCancel: () => void;
  onSubmit: (data: Kra) => void;
}) {
  const [formData, setFormData] = useState<Kra>(initial || {
    ...EMPTY,
    employeeId: currentEmployee?.id || "",
    firstName: currentEmployee?.firstName || "",
    lastName: currentEmployee?.lastName || "",
    department: currentEmployee?.department || "",
    employeeEngagementTeamName: currentEmployee?.employeeEngagementTeamName || "",
    employee: [currentEmployee?.firstName, currentEmployee?.lastName].filter(Boolean).join(" "),
  });

  const [touched, setTouched] = useState(false);

  const errors = {
    employeeId: !formData.employeeId?.trim() ? "Employee ID is required" : "",
    firstName: !formData.firstName?.trim() ? "First Name is required" : "",
    lastName: !formData.lastName?.trim() ? "Last Name is required" : "",
    objective: !formData.objective.trim() ? "Objective is required" : "",
    target: !formData.target.trim() ? "Target is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    onSubmit({
      ...formData,
      // Keep the legacy `employee` string in sync with the split name fields so
      // existing table cells / previews that read it continue to work.
      employee: [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(" ").trim() || formData.employee,
    });
  };

  const showErr = (field: keyof typeof errors) => touched && errors[field];

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4 bg-slate-50/40">
        {/* Section 1: Employee */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">1</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Employee</h3>
              <p className="text-xs text-muted-foreground">Identifies the goal owner</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <FieldWrapper label="Employee ID" required error={showErr("employeeId") ? errors.employeeId : ""}>
              <Input
                value={formData.employeeId || ""}
                onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                placeholder="e.g. EMP-0001"
                className={showErr("employeeId") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="First Name" required error={showErr("firstName") ? errors.firstName : ""}>
              <Input
                value={formData.firstName || ""}
                onChange={e => setFormData({ ...formData, firstName: e.target.value })}
                className={showErr("firstName") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Middle Name">
              <Input value={formData.middleName || ""} onChange={e => setFormData({ ...formData, middleName: e.target.value })} />
            </FieldWrapper>

            <FieldWrapper label="Last Name" required error={showErr("lastName") ? errors.lastName : ""}>
              <Input
                value={formData.lastName || ""}
                onChange={e => setFormData({ ...formData, lastName: e.target.value })}
                className={showErr("lastName") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Department">
              <Select value={formData.department || ""} onValueChange={v => setFormData({ ...formData, department: v })}>
                <SelectTrigger><SelectValue placeholder="Select an option" /></SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Employee Engagement Team Name">
              <Input
                value={formData.employeeEngagementTeamName || ""}
                onChange={e => setFormData({ ...formData, employeeEngagementTeamName: e.target.value })}
              />
            </FieldWrapper>
          </div>
        </Card>

        {/* Section 2: Objective */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Objective</h3>
              <p className="text-xs text-muted-foreground">Goal, target, actual, and weight</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="md:col-span-2">
              <FieldWrapper label="Strategic Objective" required error={showErr("objective") ? errors.objective : ""}>
                <Textarea
                  value={formData.objective}
                  onChange={e => setFormData({ ...formData, objective: e.target.value })}
                  placeholder="e.g. Increase enterprise conversion rate..."
                  className={`min-h-[100px] ${showErr("objective") ? "border-red-500" : ""}`}
                />
              </FieldWrapper>
            </div>

            <FieldWrapper label="Target Metric" required error={showErr("target") ? errors.target : ""}>
              <Input
                value={formData.target}
                onChange={e => setFormData({ ...formData, target: e.target.value })}
                placeholder="e.g. 15% increase"
                className={showErr("target") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Actual Result">
              <Input
                value={formData.actual}
                onChange={e => setFormData({ ...formData, actual: e.target.value })}
                placeholder="e.g. 12% achieved"
              />
            </FieldWrapper>

            <FieldWrapper label="Objective Weight (%)">
              <Input
                type="number"
                value={formData.weight}
                onChange={e => setFormData({ ...formData, weight: Number(e.target.value) })}
              />
            </FieldWrapper>

            <FieldWrapper label="Review Period">
              <Select value={formData.period} onValueChange={v => setFormData({ ...formData, period: v as Period })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Target Year">
              <Input
                type="number"
                value={formData.year}
                onChange={e => setFormData({ ...formData, year: Number(e.target.value) })}
              />
            </FieldWrapper>

            <FieldWrapper label="Lifecycle Status">
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as KraStatus })}>
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
                  onChange={e => setFormData({ ...formData, progress: Number(e.target.value) })}
                />
              </FieldWrapper>
            </div>

            <div className="md:col-span-2">
              <FieldWrapper label="Strategic Notes">
                <Textarea
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Context, blockers, or evidence..."
                  className="min-h-[80px]"
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
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Update Objective" : "Commit Goal"}</>
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
