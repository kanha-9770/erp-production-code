"use client";

/**
 * Self Initiative — premium workspace layout.
 */

import { useMemo, useState, useEffect } from "react";
import {
  Lightbulb, Plus, Search, Calendar, Briefcase, Pencil, Trash2, 
  CheckCircle2, Type, FileText, Tag, UserCircle, Clock, Save
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

interface Filters {
  search: string;
  status: string;
  category: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", category: "" };

export default function SelfInitiativePage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
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

  const views = useSavedViews<Filters>("self-initiatives");

  useEffect(() => {
    if (user?.id) {
      const mock: SelfInitiative[] = [
        {
          id: '1',
          title: 'Mentorship Program for Juniors',
          description: 'Guide junior developers in their career growth',
          startDate: '2026-04-01',
          endDate: '2026-12-31',
          status: 'in-progress',
          category: 'mentoring',
          createdAt: '2026-03-20',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Process Automation Initiative',
          description: 'Automate repetitive team tasks and workflows',
          startDate: '2026-05-01',
          endDate: '2026-08-31',
          status: 'in-progress',
          category: 'process-improvement',
          createdAt: '2026-04-25',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
      ];
      setInitiatives(isAdmin ? mock : mock.filter(i => i.employeeId === currentEmployee?.id));
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
    { id: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { id: "startDate", label: "Start Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = initiatives;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(i => i.title.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(i => i.status === filters.status);
    if (filters.category) result = result.filter(i => i.category === filters.category);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [initiatives, filters, conditions, filterFields]);

  const columns: ColumnDef<SelfInitiative>[] = useMemo(() => [
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
      cell: (i) => <Badge variant="outline" className="capitalize text-[10px]">{i.category.replace('-', ' ')}</Badge>,
    },
    {
      id: "status",
      header: "Status",
      width: 130,
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
      cell: (i) => <span className="text-xs text-muted-foreground">{new Date(i.startDate).toLocaleDateString()} — {new Date(i.endDate).toLocaleDateString()}</span>,
    },
  ], []);

  const handleDelete = (id: string) => {
    if (!confirm("Delete this initiative?")) return;
    setInitiatives(initiatives.filter(i => i.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Initiative deleted" });
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
              <ManageColumnsButton tableId="self-initiatives" columns={columns} />
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
        preview={selectedId ? <InitiativePreview id={selectedId} initiatives={initiatives} onEdit={(id) => { setEditingId(id); setCreateOpen(true); }} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} initiatives={initiatives} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>{editingId ? 'Edit Initiative' : 'New Initiative'}</SheetTitle>
          </SheetHeader>
          <InitiativeForm
            initial={editingId ? initiatives.find(i => i.id === editingId) : undefined}
            onCancel={() => { setCreateOpen(false); setEditingId(null); }}
            onSubmit={(data) => {
              if (editingId) {
                setInitiatives(initiatives.map(i => i.id === editingId ? { ...i, ...data } : i));
              } else {
                const newI: SelfInitiative = {
                  ...data,
                  id: Date.now().toString(),
                  createdAt: new Date().toISOString().split('T')[0],
                  userId: user?.id || '',
                  employeeId: currentEmployee?.id || '',
                };
                setInitiatives([newI, ...initiatives]);
              }
              setCreateOpen(false);
              setEditingId(null);
              toast({ title: editingId ? "Initiative updated" : "Initiative created" });
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

function InitiativePreview({ id, initiatives, onEdit, onDelete }: { id: string, initiatives: SelfInitiative[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
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

function InitiativeForm({ initial, onCancel, onSubmit }: { initial?: SelfInitiative, onCancel: () => void, onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    startDate: initial?.startDate || "",
    endDate: initial?.endDate || "",
    status: initial?.status || "planning",
    category: initial?.category || "learning",
  });

  return (
    <div className="p-6 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Initiative Title</Label>
          <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="h-12 border-slate-200" placeholder="e.g. Master React Query" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</Label>
          <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
            <SelectTrigger className="h-12 border-slate-200"><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="uppercase font-bold text-[11px]">{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Description & Scope</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="min-h-[120px] rounded-2xl border-slate-200" />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Start Date</Label>
          <Input type="date" value={formData.startDate} onChange={e => setFormData({ ...formData, startDate: e.target.value })} className="h-12 border-slate-200" />
        </div>
        <div className="space-y-2">
          <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">End Date</Label>
          <Input type="date" value={formData.endDate} onChange={e => setFormData({ ...formData, endDate: e.target.value })} className="h-12 border-slate-200" />
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current Status</Label>
        <Select value={formData.status} onValueChange={v => setFormData({ ...formData, status: v as any })}>
          <SelectTrigger className="h-12 border-slate-200"><SelectValue /></SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value} className="uppercase font-bold text-[11px]">{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-3 pt-6 border-t">
        <Button variant="ghost" onClick={onCancel} className="font-bold uppercase text-[10px] tracking-widest">Discard</Button>
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           {initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
           {initial ? 'Update Initiative' : 'Create Initiative'}
        </Button>
      </div>
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
