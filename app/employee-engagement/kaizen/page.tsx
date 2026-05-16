"use client";

/**
 * Kaizen — premium workspace layout.
 */

import { useMemo, useState, useEffect } from "react";
import {
  TrendingUp, Plus, Search, Calendar, Briefcase, Pencil, Trash2, 
  ThumbsUp, CheckCircle2, Lightbulb, Zap, Type, FileText, Layout,
  ArrowRight, Save, X, UserCircle
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

interface Filters {
  search: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "" };

export default function KaizenPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
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

  const views = useSavedViews<Filters>("kaizens");

  useEffect(() => {
    if (user?.id) {
      const mock: Kaizen[] = [
        {
          id: '1',
          title: 'Implement Automated Testing Pipeline',
          description: 'Set up CI/CD pipeline with automated tests',
          currentState: 'Manual testing process',
          proposedState: 'Automated testing with CI/CD pipeline',
          benefits: '30% reduction in testing time, fewer production bugs',
          status: 'in-implementation',
          submissionDate: '2026-04-15',
          votes: 12,
          hasVoted: false,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Optimize Database Query Performance',
          description: 'Analyze and optimize slow database queries',
          currentState: 'Slow query response times',
          proposedState: 'Optimized queries with proper indexing',
          benefits: '50% improvement in API response time',
          status: 'approved',
          submissionDate: '2026-04-20',
          votes: 8,
          hasVoted: true,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
      ];
      setKaizens(isAdmin ? mock : mock.filter(k => k.employeeId === currentEmployee?.id));
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
    { id: "submissionDate", label: "Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = kaizens;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(k => k.title.toLowerCase().includes(q) || k.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(k => k.status === filters.status);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [kaizens, filters, conditions, filterFields]);

  const columns: ColumnDef<Kaizen>[] = useMemo(() => [
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
      cell: (k) => <span className="text-xs text-muted-foreground">{new Date(k.submissionDate).toLocaleDateString()}</span>,
    },
  ], []);

  const handleDelete = (id: string) => {
    if (!confirm("Delete this kaizen?")) return;
    setKaizens(kaizens.filter(k => k.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Kaizen deleted" });
  };

  const handleVote = (id: string) => {
    setKaizens(kaizens.map(k => k.id === id ? {
      ...k,
      votes: k.hasVoted ? k.votes - 1 : k.votes + 1,
      hasVoted: !k.hasVoted
    } : k));
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
              <ManageColumnsButton tableId="kaizens" columns={columns} />
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
        preview={selectedId ? <KaizenPreview id={selectedId} kaizens={kaizens} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} onVote={handleVote} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} kaizens={kaizens} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>New Kaizen</SheetTitle>
          </SheetHeader>
          <KaizenForm
            onCancel={() => setCreateOpen(false)}
            onSubmit={(data) => {
              const newK: Kaizen = {
                ...data,
                id: Date.now().toString(),
                submissionDate: new Date().toISOString().split('T')[0],
                votes: 0,
                hasVoted: false,
                employeeId: currentEmployee?.id || ''
              };
              setKaizens([newK, ...kaizens]);
              setCreateOpen(false);
              toast({ title: "Kaizen submitted" });
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {editingId && (
            <KaizenForm
              initial={kaizens.find(k => k.id === editingId)}
              onCancel={() => setEditingId(null)}
              onSubmit={(data) => {
                setKaizens(kaizens.map(k => k.id === editingId ? { ...k, ...data } : k));
                setEditingId(null);
                toast({ title: "Kaizen updated" });
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

function KaizenPreview({ id, kaizens, onEdit, onDelete, onVote }: { id: string, kaizens: Kaizen[], onEdit: (id: string) => void, onDelete: (id: string) => void, onVote: (id: string) => void }) {
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

function KaizenForm({ initial, onCancel, onSubmit }: { initial?: Kaizen, onCancel: () => void, onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    currentState: initial?.currentState || "",
    proposedState: initial?.proposedState || "",
    benefits: initial?.benefits || "",
    status: initial?.status || "idea",
  });

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Kaizen title" />
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
      </div>
      <div className="space-y-2">
        <Label>Core Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="min-h-[80px]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Current Process</Label>
          <Textarea value={formData.currentState} onChange={e => setFormData({ ...formData, currentState: e.target.value })} className="text-xs" />
        </div>
        <div className="space-y-2">
          <Label>Proposed Improvement</Label>
          <Textarea value={formData.proposedState} onChange={e => setFormData({ ...formData, proposedState: e.target.value })} className="text-xs" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Benefits</Label>
        <Textarea value={formData.benefits} onChange={e => setFormData({ ...formData, benefits: e.target.value })} className="min-h-[60px]" />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           Save Kaizen
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
