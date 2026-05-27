"use client";

/**
 * Employee Suggestion — premium workspace layout.
 *
 * Replicates the high-end workspace UI with resizable list + preview,
 * advanced filtering, and spreadsheet-style DataTable.
 */

import Link from "next/link";
import { useMemo, useState, useEffect, useCallback } from "react";
import {
  MessageSquare, Plus, Search, Mail, Phone, Calendar,
  Briefcase, Pencil, ExternalLink, Trash2, UserCircle,
  Tag, Type, FileText, CheckCircle2, Clock, List,
  AlertCircle, Info, Save, Paperclip, Upload,
  Camera, X,
} from "lucide-react";
import {
  WorkspaceShell, WorkspaceHeader,
  DataTable, type ColumnDef,
  SelectFilter, ActiveFilterPills,
  ViewsBar, useSavedViews,
  AdvancedFilter, applyAdvancedFilters,
  type FilterField, type FilterCondition,
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet";
import { SubmitterDetails } from "@/components/employee-engagement/submitter-details";
import { useEngagementReviews, ReviewCell, ReviewBanner } from "@/app/employee-engagement/components/review-status";

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

export default function EmployeeSuggestionPage() {
  const { user } = useCurrentUser();
  const { isAdmin } = usePermissions();
  const visibility = useEngagementVisibility();
  const { toast } = useToast();

  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const reviews = useEngagementReviews("Suggestion", suggestions.length);
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

  // employeeId → team map for the visibility filter (O(1) lookups).
  const employeeToTeam = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const e of employees) m.set(e.id, (e as any).engagementTeamId ?? null);
    return m;
  }, [employees]);

  const views = useSavedViews<Filters>("employee-suggestions");

  // Pulls the team-scoped list from /api/engagement/suggestions. The server
  // already enforces visibility; the client filter is defensive only.
  const loadSuggestions = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch("/api/engagement/suggestions", {
        cache: "no-store",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Failed to load suggestions");
      const rows: EmployeeSuggestion[] = json.suggestions ?? [];
      const allow = makeEngagementFilter<EmployeeSuggestion>(visibility, employeeToTeam);
      setSuggestions(rows.filter(allow));
    } catch (e: any) {
      toast({ title: "Failed to load suggestions", description: e?.message, variant: "destructive" });
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id, visibility, employeeToTeam, toast]);

  useEffect(() => {
    if (user?.id && !visibility.loading) loadSuggestions();
  }, [user?.id, isAdmin, employees.length, visibility, loadSuggestions]);

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const filterFields: FilterField[] = useMemo(() => [
    { id: "title", label: "Title", type: "text" },
    { id: "suggestion", label: "Suggestion", type: "text" },
    { id: "category", label: "Category", type: "select", options: CATEGORY_OPTIONS },
    { id: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
    { id: "department", label: "Department", type: "select", options: DEPARTMENT_FILTER_OPTIONS },
    { id: "employeeId", label: "Employee ID", type: "text" },
    { id: "firstName", label: "First Name", type: "text" },
    { id: "middleName", label: "Middle Name", type: "text" },
    { id: "lastName", label: "Last Name", type: "text" },
    { id: "employeeEngagementTeamName", label: "Team Name", type: "text" },
    { id: "benefits", label: "Benefits", type: "text" },
    { id: "suggestionGivenBy", label: "Suggestion Given By", type: "text" },
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
    if (filters.department) result = result.filter(s => (s as any).department === filters.department);
    return applyAdvancedFilters(result, conditions, filterFields);
  }, [suggestions, filters, conditions, filterFields]);

  const columns: ColumnDef<EmployeeSuggestion>[] = useMemo(() => {
    const text = (s: EmployeeSuggestion, key: string) => {
      const v = (s as any)[key];
      return v === null || v === undefined || v === "" ? "—" : String(v);
    };
    const plain = (s: EmployeeSuggestion, key: string) => <span className="text-xs truncate">{text(s, key)}</span>;

    return [
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
        group: "Overview",
        cell: (s) => <Badge variant="outline" className="capitalize">{s.category.replace('-', ' ')}</Badge>,
      },
      {
        id: "status",
        header: "Status",
        width: 150,
        group: "Overview",
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
        id: "review",
        header: "Review",
        width: 140,
        group: "Overview",
        cell: (s) => <ReviewCell review={reviews[s.id]} />,
      },
      {
        id: "date",
        header: "Date",
        width: 130,
        group: "Overview",
        cell: (s) => <span className="text-xs text-muted-foreground">{new Date(s.submissionDate).toLocaleDateString()}</span>,
      },

      // ── Suggestion form fields ────────────────────────────────────────
      { id: "employeeId", header: "Employee ID", width: 140, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "employeeId") },
      { id: "firstName", header: "First Name", width: 140, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "firstName") },
      { id: "middleName", header: "Middle Name", width: 140, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "middleName") },
      { id: "lastName", header: "Last Name", width: 140, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "lastName") },
      { id: "department", header: "Department", width: 140, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "department") },
      { id: "employeeEngagementTeamName", header: "Employee Engagement Team Name", width: 200, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "employeeEngagementTeamName") },
      { id: "suggestion", header: "Suggestion (Full)", width: 280, group: "Suggestion", defaultHidden: true, cell: (s) => <span className="text-xs truncate">{s.suggestion || "—"}</span> },
      { id: "benefits", header: "Benefits", width: 240, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "benefits") },
      { id: "suggestionGivenBy", header: "Suggestion Given By", width: 180, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "suggestionGivenBy") },
      { id: "media", header: "Media", width: 160, group: "Suggestion", defaultHidden: true, cell: (s) => plain(s, "media") },
      { id: "feedback", header: "Feedback", width: 240, group: "Suggestion", defaultHidden: true, cell: (s) => <span className="text-xs truncate">{s.feedback || "—"}</span> },
    ];
  }, [reviews]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this suggestion?")) return;
    try {
      const res = await fetch(`/api/engagement/suggestions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json();
      if (!res.ok || !json?.success) throw new Error(json?.error ?? "Delete failed");
      setSuggestions(suggestions.filter(s => s.id !== id));
      if (selectedId === id) setSelectedId(null);
      toast({ title: "Suggestion deleted" });
    } catch (e: any) {
      toast({ title: "Could not delete", description: e?.message, variant: "destructive" });
    }
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
              {/* Search collapses to a 🔍 icon button + popover so the
                  header stays compact on mobile. */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 relative shrink-0"
                    aria-label="Search"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {filters.search && (
                      <span
                        aria-hidden
                        className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary"
                      />
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" sideOffset={6} className="w-72 p-2">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Search suggestions..."
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") updateFilter("search", searchInput);
                        if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
                      }}
                      autoFocus
                      className="pl-8 pr-7 h-8 w-full text-sm"
                    />
                    {searchInput && (
                      <button
                        type="button"
                        onClick={() => { setSearchInput(""); updateFilter("search", ""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </PopoverContent>
              </Popover>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton
                tableId="suggestions"
                columns={columns}
                variant="dialog"
              />
              <Button
                size="sm"
                className="h-8 px-2 sm:px-3 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 sm:mr-1" />
                <span className="hidden sm:inline">New Suggestion</span>
                <span className="sm:hidden">New</span>
              </Button>
            </WorkspaceHeader>

            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2">
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

            <div className="px-3 sm:px-6 pb-2 flex flex-wrap items-center gap-2 border-t pt-2">
              <SelectFilter label="Status" value={filters.status} onChange={(v) => updateFilter("status", v)} options={STATUS_OPTIONS} />
              <SelectFilter label="Category" value={filters.category} onChange={(v) => updateFilter("category", v)} options={CATEGORY_OPTIONS} />
              <SelectFilter label="Department" value={filters.department} onChange={(v) => updateFilter("department", v)} options={DEPARTMENT_FILTER_OPTIONS} />
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
            pageSize={10}
            isLoading={loading}
            selectedId={selectedId}
            onRowClick={(s) => setSelectedId(s.id)}
          />
        }
        preview={selectedId ? <SuggestionPreview id={selectedId} suggestions={suggestions} employees={employees} isAdmin={isAdmin} review={reviews[selectedId]} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} suggestions={suggestions} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Employee Suggestion <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          <SuggestionForm
            currentEmployee={currentEmployee}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (data) => {
              try {
                const res = await fetch("/api/engagement/suggestions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(data),
                });
                const json = await res.json();
                if (!res.ok || !json?.success) throw new Error(json?.error ?? "Submit failed");
                setSuggestions([json.suggestion as EmployeeSuggestion, ...suggestions]);
                setCreateOpen(false);
                toast({ title: "Suggestion submitted" });
              } catch (e: any) {
                toast({ title: "Could not submit", description: e?.message, variant: "destructive" });
              }
            }}
          />
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b sticky top-0 bg-background z-10 flex-row items-center justify-between space-y-0">
            <SheetTitle className="flex items-center gap-2">
              Employee Suggestion <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </SheetTitle>
          </SheetHeader>
          {editingId && (
            <SuggestionForm
              initial={suggestions.find(s => s.id === editingId)}
              currentEmployee={currentEmployee}
              onCancel={() => setEditingId(null)}
              onSubmit={async (data) => {
                try {
                  const res = await fetch(`/api/engagement/suggestions/${editingId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(data),
                  });
                  const json = await res.json();
                  if (!res.ok || !json?.success) throw new Error(json?.error ?? "Update failed");
                  setSuggestions(suggestions.map(s => s.id === editingId ? (json.suggestion as EmployeeSuggestion) : s));
                  setEditingId(null);
                  toast({ title: "Suggestion updated" });
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

function PreviewHeader({ id, suggestions }: { id: string, suggestions: EmployeeSuggestion[] }) {
  const s = suggestions.find(x => x.id === id);
  if (!s) return null;
  return (
    <div className="flex items-center gap-2 min-w-0 w-full">
      <Badge variant="outline" className="text-[10px] uppercase">{s.status}</Badge>
      <span className="font-semibold text-sm truncate uppercase">{s.title}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/employee-engagement/employee-suggestion/${s.id}`} title="Open full details">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function SuggestionPreview({ id, suggestions, employees, isAdmin, review, onEdit, onDelete }: { id: string, suggestions: EmployeeSuggestion[], employees: any[], isAdmin: boolean, review?: import("@/app/employee-engagement/components/review-status").EngagementReview, onEdit: (id: string) => void, onDelete: (id: string) => void }) {
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

      <ReviewBanner review={review} />

      <SubmitterDetails employeeId={s.employeeId} employees={employees} isAdmin={isAdmin} submissionDate={s.submissionDate} />

      <Card className="p-4 space-y-3">
        <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Suggestion</h3>
        <p className="text-sm leading-relaxed">{s.suggestion}</p>
      </Card>

      {s.referenceImage && (
        <Card className="p-4 space-y-3 border-l-4 border-l-purple-500 bg-purple-50/50">
          <h3 className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Reference Media</h3>
          <p className="text-sm text-purple-900 truncate">{s.referenceImage}</p>
        </Card>
      )}

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

function SuggestionForm({ initial, currentEmployee, onCancel, onSubmit }: {
  initial?: EmployeeSuggestion,
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
    suggestion: initial?.suggestion || "",
    benefits: "",
    suggestionGivenBy: "",
    media: "",
    title: initial?.title || "",
    category: initial?.category || "general",
    status: initial?.status || "submitted",
    feedback: initial?.feedback || "",
  });

  const [touched, setTouched] = useState(false);

  const errors = {
    employeeId: !formData.employeeId.trim() ? "Employee ID is required" : "",
    firstName: !formData.firstName.trim() ? "First Name is required" : "",
    lastName: !formData.lastName.trim() ? "Last Name is required" : "",
    suggestion: !formData.suggestion.trim() ? "Suggestion is required" : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const handleSubmit = () => {
    setTouched(true);
    if (hasErrors) return;
    // Persisted Suggestion fields: title, suggestion, category, status, feedback.
    // First 80 chars of the suggestion become the title fallback when blank.
    onSubmit({
      title: formData.title.trim() || formData.suggestion.slice(0, 80),
      suggestion: formData.suggestion,
      category: formData.category,
      status: formData.status,
      feedback: formData.feedback,
      employeeId: formData.employeeId,
      firstName: formData.firstName,
      middleName: formData.middleName,
      lastName: formData.lastName,
      department: formData.department,
      employeeEngagementTeamName: formData.employeeEngagementTeamName,
      benefits: formData.benefits,
      suggestionGivenBy: formData.suggestionGivenBy,
      media: formData.media,
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
              <h3 className="font-semibold text-sm">Suggestion</h3>
              <p className="text-xs text-muted-foreground">Suggestion details and benefits</p>
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

            <FieldWrapper label="Suggestion" required error={showErr("suggestion") ? errors.suggestion : ""}>
              <Textarea
                value={formData.suggestion}
                onChange={e => setFormData({ ...formData, suggestion: e.target.value })}
                placeholder="Your suggestion"
                className={`min-h-[110px] ${showErr("suggestion") ? "border-red-500" : ""}`}
              />
            </FieldWrapper>

            <FieldWrapper label="Benefits">
              <Textarea
                value={formData.benefits}
                onChange={e => setFormData({ ...formData, benefits: e.target.value })}
                placeholder="Expected benefits"
                className="min-h-[110px]"
              />
            </FieldWrapper>

            <FieldWrapper label="Suggestion Given By">
              <Input
                value={formData.suggestionGivenBy}
                onChange={e => setFormData({ ...formData, suggestionGivenBy: e.target.value })}
                placeholder="Full name"
              />
            </FieldWrapper>

            <FieldWrapper label="Media">
              <FileFieldStub
                value={formData.media}
                onChange={v => setFormData({ ...formData, media: v })}
                capture="environment"
              />
            </FieldWrapper>

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
            <>{initial ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />} {initial ? "Update Suggestion" : "Save Suggestion"}</>
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

function FileFieldStub({ value, onChange, placeholder, capture }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  // When set, adds a dedicated "Camera" button whose file input carries
  // the HTML `capture` attribute — mobile/tablet browsers open the
  // device camera directly instead of the file picker. "user" = front
  // camera (selfies), "environment" = rear camera (site photos).
  capture?: "user" | "environment";
}) {
  const [error, setError] = useState<string | null>(null);
  // 4MB raw file → ~5.4MB base64. Keeps us under the API's 6MB cap with
  // headroom for JSON overhead.
  const MAX_BYTES = 4 * 1024 * 1024;
  const isDataUrl = value.startsWith("data:image/");
  const isExternalUrl = value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/");
  const hasPreview = isDataUrl || isExternalUrl;
  const filenameLabel = !hasPreview && value ? value : "";

  const handleFile = (f: File) => {
    setError(null);
    if (!f.type.startsWith("image/")) {
      setError("Only image files are supported.");
      return;
    }
    if (f.size > MAX_BYTES) {
      setError(`Image is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Max 4 MB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (result) onChange(result);
    };
    reader.onerror = () => setError("Could not read file.");
    reader.readAsDataURL(f);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-stretch border rounded-md overflow-hidden">
        <div className="flex items-center px-3 text-muted-foreground border-r bg-slate-50">
          <Paperclip className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 px-3 py-2 text-xs text-muted-foreground truncate flex items-center min-w-0">
          {hasPreview ? (
            <span className="text-foreground font-medium truncate">Image attached</span>
          ) : filenameLabel ? (
            <span className="text-foreground truncate" title={filenameLabel}>{filenameLabel}</span>
          ) : (
            <span>{placeholder || "Choose an image…"}</span>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(""); setError(null); }}
            className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 hover:bg-slate-100"
            title="Remove image"
          >
            <X className="h-3.5 w-3.5" />
            <span className="sr-only">Remove image</span>
          </button>
        )}
        {capture && (
          <label className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 cursor-pointer hover:bg-slate-100" title="Take a photo with the camera">
            <Camera className="h-3.5 w-3.5" />
            <span className="sr-only">Take a photo</span>
            <input
              type="file"
              accept="image/*"
              capture={capture}
              aria-label="Take a photo"
              title="Take a photo"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
        <label className="flex items-center px-3 text-muted-foreground border-l bg-slate-50 cursor-pointer hover:bg-slate-100" title="Upload image">
          <Upload className="h-3.5 w-3.5" />
          <span className="sr-only">Upload image</span>
          <input
            type="file"
            accept="image/*"
            aria-label="Upload image"
            title="Upload image"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {hasPreview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={value}
          alt="Upload preview"
          className="max-h-32 rounded border bg-white object-contain"
        />
      )}

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
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</p>
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value}
      </div>
    </div>
  );
}
