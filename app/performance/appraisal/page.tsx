"use client";

/**
 * Performance Appraisal — Premium Workspace Layout.
 * Tracks employee reviews, ratings, and development feedback.
 */

import { useEffect, useMemo, useState } from "react";
import {
  TrendingUp, Plus, Search, Pencil, Trash2, Star, StarHalf,
  CheckCircle2, Clock, Eye, Calendar, User, UserCheck, MessageSquare,
  Award, TrendingDown, ClipboardCheck, ArrowRight
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
  reviewer: string;
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
  id: "", employee: "", reviewer: "", cycle: "ANNUAL", year: new Date().getFullYear(),
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
  const [items, setItems] = useState<Appraisal[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  const [filters, setFilters] = useState({ search: "", cycle: "", status: "" });
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
    { id: "reviewer", label: "Reviewer", type: "text" },
    { id: "cycle", label: "Cycle", type: "select", options: CYCLE_OPTIONS },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "rating", label: "Rating", type: "number" },
  ], []);

  const filteredItems = useMemo(() => {
    let result = items;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(a => 
        a.employee.toLowerCase().includes(q) || 
        a.id.toLowerCase().includes(q) || 
        a.reviewer.toLowerCase().includes(q)
      );
    }
    if (filters.cycle) result = result.filter(a => a.cycle === filters.cycle);
    if (filters.status) result = result.filter(a => a.status === filters.status);
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
              <ManageColumnsButton tableId="performance-appraisal" columns={columns} />
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
                   else { setFilters({ search: "", cycle: "", status: "" }); setSearchInput(""); }
                }}
                onSave={(name) => views.save(name, filters)}
                onDelete={views.remove}
                isDirty={JSON.stringify(views.views.find(v => v.id === views.activeId)?.filters ?? { search: "", cycle: "", status: "" }) !== JSON.stringify(filters)}
              />
            </div>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
              <FilterChips label="Cycle" value={filters.cycle} onChange={(v) => setFilters(f => ({ ...f, cycle: v }))} options={CYCLE_OPTIONS} />
              <FilterChips label="Status" value={filters.status} onChange={(v) => setFilters(f => ({ ...f, status: v }))} options={STATUS_OPTIONS} />
              <ActiveFilterPills filters={[]} onClear={() => {}} onClearAll={() => { setFilters({ search: "", cycle: "", status: "" }); setSearchInput(""); }} />
            </div>
          </>
        }
        list={
          <DataTable<Appraisal>
            tableId="performance-appraisal"
            columns={columns}
            rows={filteredItems}
            rowId={(a) => a.id}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(a) => setSelectedId(a.id)}
          />
        }
        preview={selectedId ? (
          <AppraisalPreview 
            id={selectedId} 
            items={items} 
            onEdit={(id) => { setEditingId(id); setFormOpen(true); }} 
            onDelete={(id) => setDeletingId(id)} 
          />
        ) : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} items={items} /> : null}
      />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle className="uppercase tracking-tight font-black">{editingId ? 'Edit Review' : 'New Performance Review'}</SheetTitle>
          </SheetHeader>
          <AppraisalForm
            initial={editingId ? items.find(i => i.id === editingId) : undefined}
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
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase font-bold">{a.id}</Badge>
      <span className="font-bold text-sm truncate uppercase tracking-tight">{a.employee}</span>
    </div>
  );
}

function AppraisalPreview({ id, items, onEdit, onDelete }: { id: string, items: Appraisal[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
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

function AppraisalForm({ initial, onCancel, onSubmit }: { initial?: Appraisal, onCancel: () => void, onSubmit: (data: Appraisal) => void }) {
  const [formData, setFormData] = useState<Appraisal>(initial || { ...EMPTY });

  return (
    <div className="p-6 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Employee Name</Label>
          <Input value={formData.employee} onChange={e => setFormData({ ...formData, employee: e.target.value })} className="h-12 border-slate-200" placeholder="e.g. John Doe" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Primary Reviewer</Label>
          <Input value={formData.reviewer} onChange={e => setFormData({ ...formData, reviewer: e.target.value })} className="h-12 border-slate-200" placeholder="e.g. Manager Name" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Review Cycle</Label>
          <Select value={formData.cycle} onValueChange={v => setFormData({ ...formData, cycle: v as Cycle })}>
            <SelectTrigger className="h-12 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>{CYCLE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="uppercase font-bold text-[11px]">{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Review Year</Label>
          <Input type="number" value={formData.year} onChange={e => setFormData({ ...formData, year: Number(e.target.value) })} className="h-12 border-slate-200 font-bold" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Current Status</Label>
          <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as AppraisalStatus })}>
            <SelectTrigger className="h-12 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="uppercase font-bold text-[11px]">{o.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-6 bg-slate-900 rounded-3xl text-white space-y-4 shadow-2xl">
         <div className="flex items-center justify-between">
            <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Performance Rating Score</Label>
            <span className="text-2xl font-black text-amber-400">{formData.rating.toFixed(1)} <span className="text-xs text-slate-600">/ 5.0</span></span>
         </div>
         <Input 
           type="range" min="0" max="5" step="0.5" 
           value={formData.rating} 
           onChange={e => setFormData({ ...formData, rating: Number(e.target.value) })}
           className="h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400 w-full"
         />
         <div className="flex justify-between text-[9px] font-bold text-slate-600 uppercase tracking-widest">
            <span>Critical</span>
            <span>Needs Impr.</span>
            <span>Satisfactory</span>
            <span>Good</span>
            <span>Excellent</span>
            <span>Exceptional</span>
         </div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Core Strengths & Achievements</Label>
          <Textarea value={formData.strengths} onChange={e => setFormData({ ...formData, strengths: e.target.value })} className="min-h-[100px] rounded-2xl border-slate-200" placeholder="Highlight key wins..." />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Opportunities for Growth</Label>
          <Textarea value={formData.improvements} onChange={e => setFormData({ ...formData, improvements: e.target.value })} className="min-h-[100px] rounded-2xl border-slate-200" placeholder="Identify focus areas..." />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Reviewer's Final Summary</Label>
          <Textarea value={formData.comments} onChange={e => setFormData({ ...formData, comments: e.target.value })} className="min-h-[100px] rounded-2xl border-slate-200" placeholder="Promotion / L&D notes..." />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button variant="ghost" onClick={onCancel} className="font-bold uppercase text-[10px] tracking-widest">Discard</Button>
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           {initial ? 'Save Review' : 'Authorize Appraisal'}
        </Button>
      </div>
    </div>
  );
}
