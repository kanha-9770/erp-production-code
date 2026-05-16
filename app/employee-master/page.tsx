"use client";

/**
 * Employee Master — premium workspace layout.
 *
 * This page replicates the exact UI pattern of the Real Estate properties page:
 * Resizable list + preview, advanced filtering, saved views, and spreadsheet-style
 * DataTable with pinned columns and local persistence.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetEmployeeListQuery,
  useGetEmployeeQuery,
  useUpdateEmployeeMutation,
  useCreateEmployeeMutation,
  useDeleteEmployeeMutation,
  type EmployeeListItem,
  type EmployeeStatus,
} from "@/lib/api/employees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Users, Plus, Search, Mail, Phone, Calendar, MapPin, Building2, User2, 
  Briefcase, CreditCard, Pencil, ExternalLink, Trash2, ChevronLeft, ChevronRight,
  ImageOff, UserCircle
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from "@/components/ui/sheet";
import { EmployeeForm } from "@/components/employee/employee-form";
import { descriptorToBase64 } from "@/lib/face/descriptor";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
  { value: "ON_LEAVE", label: "On Leave" },
  { value: "TERMINATED", label: "Terminated" },
];

const STATUS_VARIANT: Record<EmployeeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ON_LEAVE: "outline",
  TERMINATED: "destructive",
};

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "OTHER", label: "Other" },
];

interface Filters {
  search: string;
  status: string;
  gender: string;
  department: string;
  minSalary: string;
  maxSalary: string;
}

const EMPTY_FILTERS: Filters = {
  search: "", status: "", gender: "", department: "", minSalary: "", maxSalary: "",
};

export default function EmployeeMasterListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [conditions, setConditions] = useState<FilterCondition[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const views = useSavedViews<Filters>("employees");

  const onSelectView = (id: string | null) => {
    views.select(id);
    if (id == null) {
      setFilters(EMPTY_FILTERS);
      setSearchInput("");
    } else {
      const v = views.views.find((x) => x.id === id);
      if (v) {
        setFilters(v.filters);
        setSearchInput(v.filters.search);
      }
    }
    setPage(0);
  };

  const updateFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  };

  const { data, isLoading, isFetching } = useGetEmployeeListQuery();
  const rawItems = data?.employees ?? [];
  const total = rawItems.length;

  const [createEmployee, { isLoading: creating }] = useCreateEmployeeMutation();
  const [updateEmployee] = useUpdateEmployeeMutation();
  const [deleteEmployee] = useDeleteEmployeeMutation();

  const isDirty = useMemo(() => {
    if (views.activeId == null) {
      return Object.values(filters).some(Boolean);
    }
    const active = views.views.find((v) => v.id === views.activeId);
    if (!active) return true;
    return JSON.stringify(active.filters) !== JSON.stringify(filters);
  }, [filters, views.activeId, views.views]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    rawItems.forEach(e => { if (e.department) set.add(e.department); });
    return Array.from(set).map(d => ({ value: d, label: d }));
  }, [rawItems]);

  const filterFields: FilterField[] = useMemo(
    () => [
      { id: "employeeName", label: "Name", type: "text" },
      { id: "department", label: "Department", type: "text" },
      { id: "designation", label: "Designation", type: "text" },
      {
        id: "status",
        label: "Status",
        type: "select",
        options: STATUS_OPTIONS,
      },
      {
        id: "gender",
        label: "Gender",
        type: "select",
        options: GENDER_OPTIONS,
      },
      {
        id: "totalSalary",
        label: "Salary",
        type: "number",
        getValue: (e: EmployeeListItem) => Number(e.totalSalary ?? 0),
      },
      { id: "emailAddress1", label: "Email", type: "text" },
      { id: "personalContact", label: "Phone", type: "text" },
      { id: "dateOfJoining", label: "Joined", type: "date" },
    ],
    [],
  );

  const items = useMemo(() => {
    let result = rawItems;
    
    // Apply basic filters
    if (filters.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(e => 
        e.employeeName.toLowerCase().includes(q) || 
        e.emailAddress1?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q)
      );
    }
    if (filters.status) result = result.filter(e => e.status === filters.status);
    if (filters.gender) result = result.filter(e => e.gender === filters.gender);
    if (filters.department) result = result.filter(e => e.department === filters.department);
    if (filters.minSalary) result = result.filter(e => Number(e.totalSalary) >= Number(filters.minSalary));
    if (filters.maxSalary) result = result.filter(e => Number(e.totalSalary) <= Number(filters.maxSalary));

    return applyAdvancedFilters(result, conditions, filterFields);
  }, [rawItems, filters, conditions, filterFields]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search) pills.push({ key: "search", label: <>Search: <strong>{filters.search}</strong></> });
    if (filters.status) pills.push({ key: "status", label: <>Status: <strong>{filters.status}</strong></> });
    if (filters.department) pills.push({ key: "department", label: <>Dept: <strong>{filters.department}</strong></> });
    if (filters.minSalary) pills.push({ key: "minSalary", label: <>Min ₹{Number(filters.minSalary).toLocaleString()}</> });
    if (filters.maxSalary) pills.push({ key: "maxSalary", label: <>Max ₹{Number(filters.maxSalary).toLocaleString()}</> });
    return pills;
  }, [filters]);

  const columns: ColumnDef<EmployeeListItem>[] = useMemo(() => [
    {
      id: "avatar",
      header: "",
      width: 56,
      pinned: true,
      cell: () => (
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <UserCircle className="h-6 w-6 text-primary/60" />
        </div>
      ),
    },
    {
      id: "name",
      header: "Employee",
      width: 280,
      pinned: true,
      sortKey: "employeeName",
      copyValue: (e) => e.employeeName,
      cell: (e) => (
        <div className="min-w-0">
          <div className="font-medium truncate uppercase">{e.employeeName}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {e.designation ?? "No Designation"} · {e.department ?? "No Department"}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      width: 140,
      sortKey: "status",
      cell: (e) => (
        <Badge variant={STATUS_VARIANT[e.status ?? "ACTIVE"]} className="text-[10px]">
          {e.status ?? "ACTIVE"}
        </Badge>
      ),
    },
    {
      id: "salary",
      header: "Salary",
      width: 130,
      align: "right",
      sortKey: "totalSalary",
      cell: (e) => <span className="font-semibold">₹{Number(e.totalSalary || 0).toLocaleString()}</span>,
    },
    {
      id: "contact",
      header: "Contact",
      width: 220,
      cell: (e) => (
        <div className="flex flex-col text-xs gap-0.5">
          <div className="flex items-center gap-1.5 text-primary hover:underline truncate">
            <Mail className="h-3 w-3 shrink-0" />
            <span className="truncate">{e.emailAddress1?.toUpperCase() || "N/A"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="h-3 w-3 shrink-0" />
            <span>{e.personalContact || "N/A"}</span>
          </div>
        </div>
      ),
    },
    {
      id: "joined",
      header: "Joined",
      width: 130,
      sortKey: "dateOfJoining",
      cell: (e) => (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {e.dateOfJoining ? new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
        </span>
      ),
    },
  ], []);

  const handleDelete = async (e: EmployeeListItem) => {
    if (!confirm(`Delete employee "${e.employeeName}"? This cannot be undone.`)) return;
    try {
      await deleteEmployee(e.id).unwrap();
      if (selectedId === e.id) setSelectedId(null);
      toast({ title: "Employee deleted" });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Could not delete",
        description: err?.data?.error || err?.message,
      });
    }
  };

  return (
    <>
      <WorkspaceShell
        scope="employees"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<Users className="h-5 w-5" />}
              title="Employee Master"
              subtitle={`${items.length.toLocaleString()} record${items.length === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, dept, designation..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updateFilter("search", searchInput.trim());
                    if (e.key === "Escape") { setSearchInput(""); updateFilter("search", ""); }
                  }}
                  className="pl-8 h-8 w-64 text-sm"
                />
              </div>
              <AdvancedFilter fields={filterFields} value={conditions} onChange={setConditions} />
              <ManageColumnsButton tableId="employee-master" columns={columns} />
              <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> New employee
              </Button>
            </WorkspaceHeader>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-3">
              <ViewsBar
                views={views.views}
                activeId={views.activeId}
                onSelect={onSelectView}
                onSave={(name) => views.save(name, filters)}
                onRename={(id, name) => views.update(id, { name })}
                onDelete={views.remove}
                isDirty={isDirty}
                onSaveOver={() => views.activeId && views.update(views.activeId, { filters })}
              />
            </div>

            <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
              <FilterChips
                label="Status"
                value={filters.status}
                onChange={(v) => updateFilter("status", v)}
                options={STATUS_OPTIONS}
              />
              <FilterChips
                label="Dept"
                value={filters.department}
                onChange={(v) => updateFilter("department", v)}
                options={departments}
              />
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  placeholder="Min Salary"
                  value={filters.minSalary}
                  onChange={(e) => updateFilter("minSalary", e.target.value)}
                  className="h-7 w-24 text-xs"
                />
                <Input
                  type="number"
                  placeholder="Max Salary"
                  value={filters.maxSalary}
                  onChange={(e) => updateFilter("maxSalary", e.target.value)}
                  className="h-7 w-24 text-xs"
                />
              </div>
              <ActiveFilterPills
                filters={activeFilterPills}
                onClear={(k) => updateFilter(k as keyof Filters, "" as any)}
                onClearAll={() => { setFilters(EMPTY_FILTERS); setSearchInput(""); }}
              />
            </div>
          </>
        }
        list={
          <div className="flex flex-col h-full">
            <div className="flex-1 min-h-0">
              <DataTable<EmployeeListItem>
                tableId="employee-master"
                columns={columns}
                rows={items}
                rowId={(e) => e.id}
                isLoading={isLoading}
                selectedId={selectedId}
                onRowClick={(e) => setSelectedId(e.id)}
                emptyState={
                  <div className="py-20 text-center">
                    <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="text-muted-foreground">No employees found matching these criteria.</p>
                  </div>
                }
              />
            </div>
          </div>
        }
        preview={selectedId ? <EmployeePreview id={selectedId} onEdit={(id) => setEditingId(id)} onDelete={handleDelete} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} onDelete={() => {
          const e = items.find(x => x.id === selectedId);
          if (e) handleDelete(e);
        }} onEdit={() => setEditingId(selectedId)} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>New employee</SheetTitle>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            <EmployeeForm
              submitLabel="Create employee"
              submitting={creating}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload, extras) => {
                try {
                  const result = await createEmployee(payload).unwrap();
                  const userId = result?.employee?.userId ?? null;
                  if (userId && extras?.facePhoto && extras?.faceDescriptor) {
                    const fd = new FormData();
                    fd.append("photo", extras.facePhoto);
                    fd.append("descriptor", descriptorToBase64(extras.faceDescriptor));
                    fd.append("targetUserId", userId);
                    fd.append("consent", "true");
                    await fetch("/api/face/enroll", { method: "POST", body: fd });
                  }
                  toast({ title: "Employee created" });
                  setCreateOpen(false);
                } catch (e: any) {
                  toast({ title: "Creation failed", description: e?.data?.error || e?.message, variant: "destructive" });
                }
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {editingId && <EditEmployeeSheet id={editingId} onClose={() => setEditingId(null)} />}
        </SheetContent>
      </Sheet>
    </>
  );
}

function PreviewHeader({ id, onEdit, onDelete }: { id: string; onEdit: () => void; onDelete: () => void }) {
  const { data } = useGetEmployeeQuery(id);
  const e = data?.employee;
  if (!e) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={STATUS_VARIANT[e.status ?? "ACTIVE"]} className="text-[10px] shrink-0">
        {e.status ?? "ACTIVE"}
      </Badge>
      <span className="font-semibold truncate text-sm uppercase">{e.employeeName}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/profile/${e.id}`} title="Open full profile">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function EmployeePreview({ id }: { id: string; onEdit: (id: string) => void; onDelete: (e: any) => void }) {
  const { data, isLoading } = useGetEmployeeQuery(id);
  const e = data?.employee;

  if (isLoading || !e) return <div className="p-5 space-y-4"><Skeleton className="h-20 w-20 rounded-full" /><Skeleton className="h-6 w-full" /><Skeleton className="h-32 w-full" /></div>;

  return (
    <div className="p-4 sm:p-5 space-y-6 max-w-2xl mx-auto pb-10">
      <div className="flex items-center gap-4">
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center border-2 border-background shadow-sm overflow-hidden">
           <User2 className="h-10 w-10 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl font-bold truncate uppercase">{e.employeeName}</h2>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5" />
            {e.designation || "No designation"} · {e.department || "No department"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card className="p-4 space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Mail className="h-3 w-3" /> Contact</h3>
          <div className="space-y-2">
            <Fact label="Email" value={e.emailAddress1?.toUpperCase() || "—"} icon={Mail} />
            <Fact label="Phone" value={e.personalContact || "—"} icon={Phone} />
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Employment</h3>
          <div className="space-y-2">
            <Fact label="Company" value={e.companyName || "—"} icon={Building2} />
            <Fact label="Joined" value={e.dateOfJoining ? new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"} icon={Calendar} />
          </div>
        </Card>
      </div>

      <Card className="p-4 space-y-3 border-l-4 border-l-primary">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><CreditCard className="h-3 w-3" /> Compensation</h3>
        <div className="grid grid-cols-2 gap-4">
          <Fact label="Total Salary" value={e.totalSalary ? `₹${Number(e.totalSalary).toLocaleString()}` : "—"} />
          <Fact label="Engagement Team" value={e.employeeEngagementTeamName || "—"} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-y-4 text-sm pt-2 border-t">
        <Fact label="Gender" value={e.gender || "—"} />
        <Fact label="Shift" value={e.shiftType || "—"} />
        <Fact label="Employee ID" value={e.id} />
      </div>
    </div>
  );
}

function EditEmployeeSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useGetEmployeeQuery(id);
  const [updateEmployee, { isLoading: saving }] = useUpdateEmployeeMutation();
  const e = data?.employee;

  if (isLoading || !e) return <div className="p-6 space-y-3"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-32 w-full" /></div>;

  return (
    <>
      <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
        <SheetTitle>Edit {e.employeeName}</SheetTitle>
      </SheetHeader>
      <div className="px-5 sm:px-6 py-5">
        <EmployeeForm
          initial={e}
          submitLabel="Save changes"
          submitting={saving}
          onCancel={onClose}
          onSubmit={async (payload) => {
            try {
              await updateEmployee({ id, body: payload }).unwrap();
              toast({ title: "Employee updated" });
              onClose();
            } catch (err: any) {
              toast({ title: "Update failed", description: err?.data?.error || err?.message, variant: "destructive" });
            }
          }}
        />
      </div>
    </>
  );
}

function Fact({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div className="font-medium flex items-center gap-1.5 text-sm">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
        {value}
      </div>
    </div>
  );
}
