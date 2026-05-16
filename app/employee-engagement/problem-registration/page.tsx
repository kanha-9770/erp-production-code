"use client";

/**
 * Problem Registration — premium workspace layout.
 */

import { useMemo, useState, useEffect } from "react";
import {
  AlertCircle, Plus, Search, Calendar, Briefcase, Pencil, Trash2, 
  CheckCircle2, AlertTriangle, Type, FileText, Tag, UserCircle
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

interface Filters {
  search: string;
  status: string;
  severity: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", severity: "" };

export default function ProblemRegistrationPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  
  const [problems, setProblems] = useState<ProblemRegistration[]>([]);
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

  const views = useSavedViews<Filters>("problem-registrations");

  useEffect(() => {
    if (user?.id) {
      const mock: ProblemRegistration[] = [
        {
          id: '1',
          title: 'Slow API Response Times',
          description: 'API endpoints are responding slowly during peak hours',
          severity: 'high',
          category: 'technical',
          registrationDate: '2026-05-01',
          status: 'in-review',
          proposedSolution: 'Implement caching and database optimization',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Outdated Documentation',
          description: 'Project documentation is not updated with recent changes',
          severity: 'medium',
          category: 'process',
          registrationDate: '2026-04-28',
          status: 'open',
          proposedSolution: 'Schedule documentation review and update sessions',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
      ];
      setProblems(isAdmin ? mock : mock.filter(p => p.employeeId === currentEmployee?.id));
      setLoading(false);
    }
  }, [user?.id, isAdmin, employees.length]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Title", type: "text" },
    { id: "description", label: "Description", type: "text" },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "severity", label: "Severity", type: "select", options: SEVERITY_OPTIONS },
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
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [problems, filters, conditions, filterFields]);

  const columns: ColumnDef<ProblemRegistration>[] = useMemo(() => [
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
      id: "date",
      header: "Registered",
      width: 130,
      cell: (p) => <span className="text-xs text-muted-foreground">{new Date(p.registrationDate).toLocaleDateString()}</span>,
    },
  ], []);

  const handleDelete = (id: string) => {
    if (!confirm("Delete this problem record?")) return;
    setProblems(problems.filter(p => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Problem deleted" });
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
              <ManageColumnsButton tableId="problem-registrations" columns={columns} />
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
        preview={selectedId ? <ProblemPreview id={selectedId} problems={problems} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} problems={problems} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>Register New Problem</SheetTitle>
          </SheetHeader>
          <ProblemForm
            onCancel={() => setCreateOpen(false)}
            onSubmit={(data) => {
              const newP: ProblemRegistration = {
                ...data,
                id: Date.now().toString(),
                registrationDate: new Date().toISOString().split('T')[0],
                userId: user?.id || '',
                employeeId: currentEmployee?.id || '',
                status: 'open'
              };
              setProblems([newP, ...problems]);
              setCreateOpen(false);
              toast({ title: "Problem registered" });
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {editingId && (
            <ProblemForm
              initial={problems.find(p => p.id === editingId)}
              onCancel={() => setEditingId(null)}
              onSubmit={(data) => {
                setProblems(problems.map(p => p.id === editingId ? { ...p, ...data } : p));
                setEditingId(null);
                toast({ title: "Problem updated" });
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

function ProblemPreview({ id, problems, onEdit, onDelete }: { id: string, problems: ProblemRegistration[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
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

function ProblemForm({ initial, onCancel, onSubmit }: { initial?: ProblemRegistration, onCancel: () => void, onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    severity: initial?.severity || "medium",
    category: initial?.category || "operational",
    status: initial?.status || "open",
    proposedSolution: initial?.proposedSolution || "",
  });

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Problem title" />
        </div>
        <div className="space-y-2">
          <Label>Severity</Label>
          <Select value={formData.severity} onValueChange={v => setFormData({ ...formData, severity: v as any })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {SEVERITY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="min-h-[100px]" />
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as any })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Proposed Solution (Optional)</Label>
        <Textarea value={formData.proposedSolution} onChange={e => setFormData({ ...formData, proposedSolution: e.target.value })} className="min-h-[80px]" />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           Save Record
        </Button>
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
