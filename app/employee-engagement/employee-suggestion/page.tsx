"use client";

/**
 * Employee Suggestion — premium workspace layout.
 *
 * Replicates the high-end workspace UI with resizable list + preview,
 * advanced filtering, and spreadsheet-style DataTable.
 */

import { useMemo, useState, useEffect } from "react";
import {
  MessageSquare, Plus, Search, Mail, Phone, Calendar, 
  Briefcase, Pencil, ExternalLink, Trash2, UserCircle,
  Tag, Type, FileText, CheckCircle2, Clock, List
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet";

interface EmployeeSuggestion {
  id: string;
  title: string;
  suggestion: string;
  category: string;
  status: 'submitted' | 'under-review' | 'accepted' | 'rejected' | 'implemented';
  submissionDate: string;
  feedback?: string;
  userId: string;
  employeeId: string;
}

const STATUS_OPTIONS = [
  { value: "submitted", label: "Submitted" },
  { value: "under-review", label: "Under Review" },
  { value: "accepted", label: "Accepted" },
  { value: "implemented", label: "Implemented" },
  { value: "rejected", label: "Rejected" },
];

const CATEGORY_OPTIONS = [
  { value: "general", label: "General" },
  { value: "hr-policy", label: "HR Policy" },
  { value: "learning", label: "Learning & Development" },
  { value: "facilities", label: "Office Facilities" },
  { value: "benefits", label: "Employee Benefits" },
  { value: "team-building", label: "Team Building" },
  { value: "process", label: "Internal Processes" },
  { value: "other", label: "Other" },
];

interface Filters {
  search: string;
  status: string;
  category: string;
}

const EMPTY_FILTERS: Filters = { search: "", status: "", category: "" };

export default function EmployeeSuggestionPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const { toast } = useToast();
  
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
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

  const views = useSavedViews<Filters>("employee-suggestions");

  useEffect(() => {
    if (user?.id) {
      // Mock data for now as per original file
      const mock: EmployeeSuggestion[] = [
        {
          id: '1',
          title: 'Flexible Work Hours Policy',
          suggestion: 'Implement flexible work hours to improve work-life balance',
          category: 'hr-policy',
          status: 'accepted',
          submissionDate: '2026-04-10',
          feedback: 'Great idea! We are planning to implement this next quarter.',
          userId: user.id,
          employeeId: employees[0]?.id || currentEmployee?.id || '',
        },
        {
          id: '2',
          title: 'Weekly Tech Talks',
          suggestion: 'Organize weekly tech talks to share knowledge',
          category: 'learning',
          status: 'implemented',
          submissionDate: '2026-03-15',
          feedback: 'Implemented! First tech talk is scheduled for next week.',
          userId: user.id,
          employeeId: employees[1]?.id || currentEmployee?.id || '',
        },
      ];
      setSuggestions(isAdmin ? mock : mock.filter(s => s.employeeId === currentEmployee?.id));
      setLoading(false);
    }
  }, [user?.id, isAdmin, employees.length]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Title", type: "text" },
    { id: "suggestion", label: "Suggestion", type: "text" },
    { id: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "submissionDate", label: "Date", type: "date" },
  ], []);

  const items = useMemo(() => {
    let result = suggestions;
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(s => s.title.toLowerCase().includes(q) || s.suggestion.toLowerCase().includes(q));
    }
    if (filters.status) result = result.filter(s => s.status === filters.status);
    if (filters.category) result = result.filter(s => s.category === filters.category);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [suggestions, filters, conditions, filterFields]);

  const columns: ColumnDef<EmployeeSuggestion>[] = useMemo(() => [
    {
      id: "title",
      header: "Suggestion",
      width: 300,
      pinned: true,
      cell: (s) => (
        <div className="min-w-0">
          <div className="font-medium truncate uppercase">{s.title}</div>
          <div className="text-[11px] text-muted-foreground truncate">{s.suggestion}</div>
        </div>
      ),
    },
    {
      id: "category",
      header: "Category",
      width: 150,
      cell: (s) => <Badge variant="outline" className="capitalize">{s.category.replace('-', ' ')}</Badge>,
    },
    {
      id: "status",
      header: "Status",
      width: 150,
      cell: (s) => {
        const colors: Record<string, string> = {
          submitted: "bg-blue-100 text-blue-800",
          "under-review": "bg-yellow-100 text-yellow-800",
          accepted: "bg-green-100 text-green-800",
          implemented: "bg-green-100 text-green-800",
          rejected: "bg-red-100 text-red-800",
        };
        return <Badge variant="outline" className={`${colors[s.status]} text-[10px]`}>{s.status.replace('-', ' ')}</Badge>;
      },
    },
    {
      id: "date",
      header: "Date",
      width: 130,
      cell: (s) => <span className="text-xs text-muted-foreground">{new Date(s.submissionDate).toLocaleDateString()}</span>,
    },
  ], []);

  const handleDelete = (id: string) => {
    if (!confirm("Delete this suggestion?")) return;
    setSuggestions(suggestions.filter(s => s.id !== id));
    if (selectedId === id) setSelectedId(null);
    toast({ title: "Suggestion deleted" });
  };

  return (
    <>
      <WorkspaceShell
        scope="suggestions"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<MessageSquare className="h-5 w-5 text-purple-600" />}
              title="Employee Suggestions"
              subtitle={`${items.length} suggestion${items.length === 1 ? "" : "s"}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search suggestions..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && updateFilter("search", searchInput)}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton tableId="suggestions" columns={columns} />
              <Button size="sm" className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold transition-all active:scale-95" onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> New Suggestion
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
          <DataTable<EmployeeSuggestion>
            tableId="suggestions"
            columns={columns}
            rows={items}
            rowId={(s) => s.id}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(s) => setSelectedId(s.id)}
          />
        }
        preview={selectedId ? <SuggestionPreview id={selectedId} suggestions={suggestions} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} suggestions={suggestions} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>New Suggestion</SheetTitle>
          </SheetHeader>
          <SuggestionForm
            onCancel={() => setCreateOpen(false)}
            onSubmit={(data) => {
              const newS: EmployeeSuggestion = {
                ...data,
                id: Date.now().toString(),
                submissionDate: new Date().toISOString().split('T')[0],
                userId: user?.id || '',
                employeeId: currentEmployee?.id || '',
                status: 'submitted'
              };
              setSuggestions([newS, ...suggestions]);
              setCreateOpen(false);
              toast({ title: "Suggestion submitted" });
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {editingId && (
            <SuggestionForm
              initial={suggestions.find(s => s.id === editingId)}
              onCancel={() => setEditingId(null)}
              onSubmit={(data) => {
                setSuggestions(suggestions.map(s => s.id === editingId ? { ...s, ...data } : s));
                setEditingId(null);
                toast({ title: "Suggestion updated" });
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PreviewHeader({ id, suggestions }: { id: string, suggestions: EmployeeSuggestion[] }) {
  const s = suggestions.find(x => x.id === id);
  if (!s) return null;
  return (
    <div className="flex items-center gap-2">
      <Badge variant="outline" className="text-[10px] uppercase">{s.status}</Badge>
      <span className="font-semibold text-sm truncate uppercase">{s.title}</span>
    </div>
  );
}

function SuggestionPreview({ id, suggestions, onEdit, onDelete }: { id: string, suggestions: EmployeeSuggestion[], onEdit: (id: string) => void, onDelete: (id: string) => void }) {
  const s = suggestions.find(x => x.id === id);
  if (!s) return null;

  return (
    <div className="p-5 space-y-6">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold uppercase">{s.title}</h2>
          <p className="text-sm text-muted-foreground">{s.category.replace('-', ' ').toUpperCase()}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(s.id)}><Pencil className="h-4 h-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(s.id)}><Trash2 className="h-4 h-4" /></Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Suggestion</h3>
        <p className="text-sm leading-relaxed">{s.suggestion}</p>
      </Card>

      {s.feedback && (
        <Card className="p-4 space-y-3 border-l-4 border-l-blue-500 bg-blue-50/50">
          <h3 className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider">Feedback</h3>
          <p className="text-sm text-blue-900">{s.feedback}</p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 text-sm pt-4 border-t">
        <Fact label="Submitted On" value={new Date(s.submissionDate).toLocaleDateString()} icon={Calendar} />
        <Fact label="Status" value={s.status.toUpperCase()} icon={CheckCircle2} />
      </div>
    </div>
  );
}

function SuggestionForm({ initial, onCancel, onSubmit }: { initial?: EmployeeSuggestion, onCancel: () => void, onSubmit: (data: any) => void }) {
  const [formData, setFormData] = useState({
    title: initial?.title || "",
    suggestion: initial?.suggestion || "",
    category: initial?.category || "general",
    status: initial?.status || "submitted",
    feedback: initial?.feedback || "",
  });

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-2">
        <Label>Title</Label>
        <Input value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} placeholder="Suggestion title" />
      </div>
      <div className="space-y-2">
        <Label>Category</Label>
        <Select value={formData.category} onValueChange={v => setFormData({ ...formData, category: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {CATEGORY_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={formData.suggestion} onChange={e => setFormData({ ...formData, suggestion: e.target.value })} className="min-h-[120px]" />
      </div>
      <div className="flex justify-end gap-3 pt-4">
        <Button onClick={() => onSubmit(formData)} className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-12 px-8 rounded-xl shadow-lg transition-all active:scale-95">
           Save Suggestion
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
