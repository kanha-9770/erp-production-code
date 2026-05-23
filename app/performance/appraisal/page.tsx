"use client";

/**
 * Performance Appraisal — Premium Workspace Layout.
 * Tracks employee reviews, ratings, and development feedback.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Plus, Search, Pencil, Trash2, Star, StarHalf,
  CheckCircle2, Clock, Eye, Calendar, User, UserCheck, MessageSquare,
  Award, TrendingDown, ClipboardCheck, ArrowRight, AlertCircle, Save, Info,
  ExternalLink,
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

type AppraisalStatus = "PENDING" | "IN_REVIEW" | "COMPLETED" | "ACKNOWLEDGED";
type Cycle = "Q1" | "Q2" | "Q3" | "Q4" | "MID_YEAR" | "ANNUAL";

interface Appraisal {
  id: string;
  employee: string;
  // Employee identification (parallel to engagement module).
  employeeId?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  department?: string;
  employeeEngagementTeamName?: string;
  reviewer: string;
  reviewerId?: string;
  cycle: Cycle;
  year: number;
  rating: number; // 0-5
  strengths: string;
  improvements: string;
  comments: string;
  status: AppraisalStatus;
  submittedAt: string;
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "COMPLETED", label: "Completed" },
  { value: "ACKNOWLEDGED", label: "Acknowledged" },
];

const CYCLE_OPTIONS = [
  { value: "Q1", label: "Q1" },
  { value: "Q2", label: "Q2" },
  { value: "Q3", label: "Q3" },
  { value: "Q4", label: "Q4" },
  { value: "MID_YEAR", label: "Mid-year" },
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

const STORAGE_KEY = "performance-appraisal:v1";

const SEED: Appraisal[] = [
  {
    id: "APR-0001",
    employee: "Riya Sharma",
    reviewer: "Sanjay Pillai",
    cycle: "ANNUAL",
    year: 2024,
    rating: 4.5,
    strengths: "Owned the ticket-resolution initiative end-to-end. Strong stakeholder communication.",
    improvements: "Delegate more to L1 — currently a bottleneck on escalations.",
    comments: "Promotion candidate for next cycle.",
    status: "COMPLETED",
    submittedAt: "2025-01-12",
  },
  {
    id: "APR-0002",
    employee: "Arjun Mehta",
    reviewer: "Sanjay Pillai",
    cycle: "ANNUAL",
    year: 2024,
    rating: 5,
    strengths: "Exceeded sales target by 38%. Mentored 3 new joiners successfully.",
    improvements: "Documentation discipline on closed deals.",
    comments: "Top performer — flagged for retention.",
    status: "ACKNOWLEDGED",
    submittedAt: "2025-01-14",
  },
];

const EMPTY: Appraisal = {
  id: "", employee: "", employeeId: "", firstName: "", middleName: "", lastName: "",
  department: "", employeeEngagementTeamName: "",
  reviewer: "", reviewerId: "",
  cycle: "ANNUAL", year: new Date().getFullYear(),
  rating: 0, strengths: "", improvements: "", comments: "", status: "PENDING", submittedAt: ""
};

// --- Components ---

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) stars.push(<Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />);
    else if (rating >= i - 0.5) stars.push(<StarHalf key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />);
    else stars.push(<Star key={i} className="h-3 w-3 text-slate-200" />);
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export default function PerformanceAppraisalPage() {
  const { toast } = useToast();
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const { data: empData } = useGetEmployeeListQuery();
  const employees = empData?.employees ?? [];
  const currentEmployee = employees.find(e => e.userId === user?.id);

  const [items, setItems] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [filters, setFilters] = useState({ search: "", cycle: "", status: "", department: "" });
  const [searchInput, setSearchInput] = useState("");
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const views = useSavedViews<typeof filters>("performance-appraisal");

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
    { id: "reviewer", label: "Reviewer", type: "text" },
    { id: "cycle", label: "Cycle", type: "select", options: CYCLE_OPTIONS },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "rating", label: "Rating", type: "number" },
    { id: "year", label: "Year", type: "number" },
    { id: "strengths", label: "Strengths", type: "text" },
    { id: "improvements", label: "Growth Areas", type: "text" },
    { id: "comments", label: "Comments", type: "text" },
    { id: "submittedAt", label: "Submitted At", type: "date" },
  ], []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(a =>
        a.employee.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.reviewer.toLowerCase().includes(q) ||
        (a.employeeId?.toLowerCase().includes(q) ?? false)
      );
    }
    if (filters.cycle) result = result.filter(a => a.cycle === filters.cycle);
    if (filters.status) result = result.filter(a => a.status === filters.status);
    if (filters.department) result = result.filter(a => a.department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [items, filters, conditions, filterFields]);

  const columns: ColumnDef<Appraisal>[] = useMemo(() => [
    {
      id: "id",
      header: "Appraisal ID",
      width: 120,
      pinned: true,
      cell: (a) => <span className="font-mono text-[11px] font-bold text-muted-foreground uppercase">{a.id}</span>,
    },
    {
      id: "employee",
      header: "Employee / Reviewer",
      width: 280,
      cell: (a) => (
        <div className="min-w-0">
           <div className="font-bold truncate uppercase text-[12px]">{a.employee}</div>
           <div className="text-[10px] text-muted-foreground truncate uppercase flex items-center gap-1">
              <UserCheck className="h-3 w-3" /> REVIEWED BY {a.reviewer || "PENDING"}
           </div>
        </div>
      ),
    },
    {
      id: "cycle",
      header: "Cycle",
      width: 130,
      cell: (a) => <Badge variant="outline" className="text-[10px] font-bold uppercase">{a.cycle} {a.year}</Badge>,
    },
    {
      id: "rating",
      header: "Performance Rating",
      width: 160,
      cell: (a) => (
        <div className="space-y-1">
           <StarRating rating={a.rating} />
           <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{a.rating > 0 ? `${a.rating} / 5.0` : 'NOT RATED'}</div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: 130,
      cell: (a) => {
        const colors: Record<string, string> = {
          PENDING: "bg-slate-100 text-slate-800",
          IN_REVIEW: "bg-amber-100 text-amber-800",
          COMPLETED: "bg-emerald-100 text-emerald-800",
          ACKNOWLEDGED: "bg-blue-100 text-blue-800",
        };
        return <Badge variant="outline" className={`${colors[a.status]} text-[10px] font-bold uppercase`}>{a.status.replace('_', ' ')}</Badge>;
      },
    },
  ], []);

  const handleSave = (draft: Appraisal) => {
    if (editingId) {
      setItems(items.map(i => i.id === editingId ? draft : i));
      toast({ title: "Appraisal Updated" });
    } else {
      const newId = `APR-${String(items.length + 1).padStart(4, '0')}`;
      setItems([{ ...draft, id: newId }, ...items]);
      toast({ title: "Appraisal Created" });
    }
    setFormOpen(false);
    setEditingId(null);
  };

  const handleDelete = () => {
    if (!deletingId) return;
    setItems(items.filter(i => i.id !== deletingId));
    if (selectedId === deletingId) setSelectedId(null);
    setDeletingId(null);
    toast({ title: "Appraisal Deleted", variant: "destructive" });
  };

  return (
    <>
      <WorkspaceShell
        scope="performance-appraisal"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
              title="Performance Appraisal"
              subtitle={`${filteredItems.length} reviews in cycle`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search employee, reviewer..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setFilters(f => ({ ...f, search: searchInput }))}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="performance-appraisal"
                columns={columns}
                variant="dialog"
              />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => { setEditingId(null); setFormOpen(true); }}>
                <Plus className="h-4 w-4 mr-1.5" /> Start Appraisal
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
                   else { setFilters({ search: "", cycle: "", status: "", department: "" }); setSearchInput(""); }
                }}
                onSave={(name) => views.save(name, filters)}
                onDelete={views.remove}
                isDirty={JSON.stringify(views.views.find(v => v.id === views.activeId)?.filters ?? { search: "", cycle: "", status: "", department: "" }) !== JSON.stringify(filters)}
              />
            </div>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
              <FilterChips label="Cycle" value={filters.cycle} onChange={(v) => setFilters(f => ({ ...f, cycle: v }))} options={CYCLE_OPTIONS} />
              <FilterChips label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={STATUS_OPTIONS} />
              <FilterChips label="Department" value={filters.department} onChange={(v) => setFilters(f => ({ ...f, department: v }))} options={DEPARTMENT_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters({ search: "", cycle: "", status: "", department: "" }); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<Appraisal>
            tableId="performance-appraisal"
            columns={columns}
            rows={filteredItems}
            rowId={(a) => a.id}
            pageSize={10}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(a) => setSelectedId(a.id)}
          />
        }
        preview={selectedId ? (
          <AppraisalPreview
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
              Performance Appraisal <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <AppraisalForm
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
            <AlertDialogTitle>Delete this appraisal?</AlertDialogTitle>
            <AlertDialogDescription>This action will permanently remove the performance record. It cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete Record</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function PreviewHeader({ id, items }: { id: string, items: Appraisal[] }) {
  const a = items.find(x => x.id === id);
  if (!a) return null;
  return (
    <div className="flex items-center gap-2 min-w-0 w-full">
      <Badge variant="outline" className="text-[10px] uppercase font-bold">{a.id}</Badge>
      <span className="font-bold text-sm truncate uppercase tracking-tight">{a.employee}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/performance/appraisal/${a.id}`} title="Open full details">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function AppraisalPreview({ id, items, employees, isAdmin, onEdit, onDelete }: { id: string, items: Appraisal[], employees: any[], isAdmin: boolean, onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const a = items.find(x => x.id === id);
  if (!a) return null;

  return (
    <div className="p-6 space-y-8">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
           <h2 className="text-3xl font-black uppercase tracking-tighter leading-none">{a.employee}</h2>
           <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] font-black uppercase tracking-[0.1em]">{a.cycle} {a.year} CYCLE</Badge>
              <div className="h-1 w-1 rounded-full bg-slate-300" />
              <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-tight">
                 <UserCheck className="h-3.5 w-3.5" /> Reviewed by {a.reviewer}
              </div>
           </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-2xl" onClick={() => onEdit(a.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-10 w-10 rounded-2xl text-destructive" onClick={() => onDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <SubmitterDetails employeeId={a.employeeId ?? ""} employees={employees} isAdmin={isAdmin} submissionDate={a.submittedAt} />

      <div className="grid grid-cols-2 gap-4">
         <Card className="p-5 border-0 bg-slate-50 flex flex-col justify-between overflow-hidden relative">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Overall Score</span>
            <div className="flex items-baseline gap-2 relative z-10">
               <span className="text-4xl font-black">{a.rating.toFixed(1)}</span>
               <span className="text-xs font-bold text-slate-400">/ 5.0</span>
            </div>
            <div className="mt-3 relative z-10"><StarRating rating={a.rating} /></div>
            <Award className="absolute -bottom-4 -right-4 h-24 w-24 text-slate-100 -rotate-12" />
         </Card>
         <Card className="p-5 border-0 bg-slate-50 flex flex-col justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Status & Submission</span>
            <div className="space-y-1">
               <div className="font-black text-sm uppercase tracking-tight">{a.status.replace('_', ' ')}</div>
               <div className="text-[11px] font-bold text-slate-500 uppercase flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> {a.submittedAt || 'NOT YET SUBMITTED'}
               </div>
            </div>
            <div className="mt-4"><Badge className="bg-emerald-500 text-white border-0 font-black text-[9px] uppercase tracking-widest px-2">VALIDATED</Badge></div>
         </Card>
      </div>

      <div className="space-y-6">
         <Section icon={Award} title="Top Strengths" content={a.strengths} color="text-emerald-600" bg="bg-emerald-50" />
         <Section icon={TrendingDown} title="Growth Areas" content={a.improvements} color="text-amber-600" bg="bg-amber-50" />
         <Section icon={MessageSquare} title="Executive Summary" content={a.comments} color="text-blue-600" bg="bg-blue-50" />
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, content, color, bg }: { icon: any, title: string, content: string, color: string, bg: string }) {
   return (
      <div className="space-y-3">
         <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${bg} ${color}`}><Icon className="h-4 w-4" /></div>
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{title}</h3>
         </div>
         <p className="text-sm font-medium leading-relaxed text-slate-700 bg-slate-50/50 p-4 rounded-xl border border-slate-100">{content || "No detailed observation recorded for this category."}</p>
      </div>
   );
}

function AppraisalForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: Appraisal;
  currentEmployee?: any;
  onCancel: () => void;
  onSubmit: (data: Appraisal) => void;
}) {
  const [formData, setFormData] = useState<Appraisal>(initial || {
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
    reviewer: !formData.reviewer.trim() ? "Reviewer is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    onSubmit({
      ...formData,
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
              <p className="text-xs text-muted-foreground">Person being reviewed</p>
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

        {/* Section 2: Review Cycle */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">2</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Review Cycle</h3>
              <p className="text-xs text-muted-foreground">Reviewer, cycle, rating</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <FieldWrapper label="Primary Reviewer" required error={showErr("reviewer") ? errors.reviewer : ""}>
              <Input
                value={formData.reviewer}
                onChange={e => setFormData({ ...formData, reviewer: e.target.value })}
                placeholder="e.g. Manager Name"
                className={showErr("reviewer") ? "border-red-500" : ""}
              />
            </FieldWrapper>

            <FieldWrapper label="Reviewer ID">
              <Input
                value={formData.reviewerId || ""}
                onChange={e => setFormData({ ...formData, reviewerId: e.target.value })}
                placeholder="e.g. EMP-0099"
              />
            </FieldWrapper>

            <FieldWrapper label="Review Cycle">
              <Select value={formData.cycle} onValueChange={v => setFormData({ ...formData, cycle: v as Cycle })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CYCLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Review Year">
              <Input
                type="number"
                value={formData.year}
                onChange={e => setFormData({ ...formData, year: Number(e.target.value) })}
              />
            </FieldWrapper>

            <FieldWrapper label="Current Status">
              <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as AppraisalStatus })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </FieldWrapper>

            <FieldWrapper label="Submitted At">
              <Input
                type="date"
                value={formData.submittedAt}
                onChange={e => setFormData({ ...formData, submittedAt: e.target.value })}
              />
            </FieldWrapper>

            <div className="md:col-span-2">
              <FieldWrapper label={`Performance Rating (${formData.rating.toFixed(1)} / 5.0)`}>
                <Input
                  type="range"
                  min={0}
                  max={5}
                  step={0.5}
                  value={formData.rating}
                  onChange={e => setFormData({ ...formData, rating: Number(e.target.value) })}
                />
              </FieldWrapper>
            </div>
          </div>
        </Card>

        {/* Section 3: Review Feedback */}
        <Card className="p-5 space-y-5 bg-white">
          <div className="flex items-start gap-3 pb-4 border-b">
            <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">3</div>
            <div className="space-y-0.5">
              <h3 className="font-semibold text-sm">Review Feedback</h3>
              <p className="text-xs text-muted-foreground">Strengths, growth areas, comments</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-6 gap-y-4">
            <FieldWrapper label="Core Strengths & Achievements">
              <Textarea
                value={formData.strengths}
                onChange={e => setFormData({ ...formData, strengths: e.target.value })}
                placeholder="Highlight key wins..."
                className="min-h-[100px]"
              />
            </FieldWrapper>

            <FieldWrapper label="Opportunities for Growth">
              <Textarea
                value={formData.improvements}
                onChange={e => setFormData({ ...formData, improvements: e.target.value })}
                placeholder="Identify focus areas..."
                className="min-h-[100px]"
              />
            </FieldWrapper>

            <FieldWrapper label="Reviewer's Final Summary">
              <Textarea
                value={formData.comments}
                onChange={e => setFormData({ ...formData, comments: e.target.value })}
                placeholder="Promotion / L&D notes..."
                className="min-h-[100px]"
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
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Save Review" : "Authorize Appraisal"}</>
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
