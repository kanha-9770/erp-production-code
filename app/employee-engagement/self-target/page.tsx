"use client";

/**
 * Self Target — premium workspace layout.
 */

import { useMemo, useState, useEffect, useCallback } from "react";
import {
  Target, Plus, Search, Calendar, Briefcase, Pencil, Trash2, 
  CheckCircle2, Type, FileText, Zap, UserCircle, Clock
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

interface Filters {
  search: string;
  status: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "" };

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
    { id: "title", label: "Title", type: "text" },
    { id: "description", label: "Description", type: "text" },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "targetDate", label: "Target Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = targets;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(t => t.status === filters.status);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [targets, filters, conditions, filterFields]);

  const columns: ColumnDef<SelfTarget>[] = useMemo(() => [
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
      cell: (t) => <span className="text-xs text-muted-foreground">{new Date(t.targetDate).toLocaleDateString()}</span>,
    },
  ], []);

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
              <ManageColumnsButton tableId="self-targets" columns={columns} />
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
        preview={selectedId ? <TargetPreview id={selectedId} targets={targets} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} targets={targets} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>New Target</SheetTitle>
          </SheetHeader>
          <TargetForm
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
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {editingId && (
            <TargetForm
              initial={targets.find(t => t.id === editingId)}
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

function TargetPreview({ id, targets, onEdit, onDelete }: { id: string, targets: SelfTarget[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
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

function TargetForm({ initial, onCancel, onSubmit }: { initial?: SelfTarget, onCancel: () => void, onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    targetDate: initial?.targetDate || "",
    status: initial?.status || "not-started",
    progress: initial?.progress || 0,
  });

  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Target title" />
        </div>
        <div className="space-y-2">
          <Label>Target Date</Label>
          <Input type="date" value={formData.targetDate} onChange={e => setFormData({ ...formData, targetDate: e.target.value })} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="min-h-[100px]" />
      </div>
      <div className="grid grid-cols-2 gap-4 items-end">
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
          <Label>Progress ({formData.progress}%)</Label>
          <Input type="range" min="0" max="100" value={formData.progress} onChange={e => setFormData({ ...formData, progress: parseInt(e.target.value) })} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           {initial ? 'Update Target' : 'Create Target'}
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
