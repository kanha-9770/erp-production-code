"use client";

/**
 * Staffing Plans — workforce planning workspace.
 *
 * Mirrors the /employee-master pattern: resizable list + preview, persisted
 * column visibility/sort, saved filter views, status inline-edit, and a row
 * preview drawer. Click "+ New plan" to create one.
 */

import { useMemo, useState } from "react";
import {
  useGetStaffingPlansQuery,
  useGetStaffingPlanQuery,
  useUpdateStaffingPlanMutation,
  useCreateStaffingPlanMutation,
  useDeleteStaffingPlanMutation,
  type StaffingPlan,
  type StaffingPlanStatus,
  type EmploymentType,
} from "@/lib/api/staffing-plans";
import { useGetEmployeeListQuery } from "@/lib/api/employees";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { StaffingPlanForm } from "@/components/staffing-plan/staffing-plan-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Briefcase,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Layers,
  Users as UsersIcon,
  Calculator,
  Calendar,
} from "lucide-react";
import {
  WorkspaceShell,
  WorkspaceHeader,
  DataTable,
  type ColumnDef,
  FilterChips,
  ActiveFilterPills,
  ViewsBar,
  useSavedViews,
  InlineEditCell,
} from "@/components/real-estate/workspace";
import { useToast } from "@/hooks/use-toast";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<StaffingPlanStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  ON_HOLD: "On hold",
  FILLED: "Filled",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<
  StaffingPlanStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  OPEN: "default",
  ON_HOLD: "outline",
  FILLED: "outline",
  CANCELLED: "destructive",
};

const STATUS_OPTIONS: Array<{
  value: StaffingPlanStatus;
  label: string;
  tint: string;
}> = [
  { value: "DRAFT", label: "Draft", tint: "#9ca3af" },
  { value: "OPEN", label: "Open", tint: "#22c55e" },
  { value: "ON_HOLD", label: "On hold", tint: "#f59e0b" },
  { value: "FILLED", label: "Filled", tint: "#0ea5e9" },
  { value: "CANCELLED", label: "Cancelled", tint: "#ef4444" },
];

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
  TEMPORARY: "Temporary",
  CONSULTANT: "Consultant",
};

interface Filters {
  search: string;
  status: string;
  employmentType: string;
  department: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  employmentType: "",
  department: "",
};

function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function StaffingPlanListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createPlan, { isLoading: creating }] = useCreateStaffingPlanMutation();

  // Seed the department dropdown with departments already used by existing
  // employees so HR keeps the vocabulary consistent.
  const { data: employeeData } = useGetEmployeeListQuery();
  const employeeDepartments = useMemo(() => {
    const set = new Set<string>();
    employeeData?.employees?.forEach((e) => {
      const d = (e.department ?? "").trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employeeData]);

  const views = useSavedViews<Filters>("staffing-plans");

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

  const { data, isLoading, isFetching } = useGetStaffingPlansQuery();
  const allPlans = useMemo(() => data?.plans ?? [], [data?.plans]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    allPlans.forEach((p) => {
      const d = (p.department ?? "").trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allPlans]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allPlans.filter((p) => {
      if (filters.status && p.status !== filters.status) return false;
      if (filters.employmentType && p.employmentType !== filters.employmentType)
        return false;
      if (filters.department && p.department !== filters.department)
        return false;
      if (!q) return true;
      return (
        p.profileName?.toLowerCase().includes(q) ||
        p.department?.toLowerCase().includes(q) ||
        p.designation?.toLowerCase().includes(q) ||
        (p.planCode ?? "").toLowerCase().includes(q) ||
        p.id?.toLowerCase().includes(q)
      );
    });
  }, [allPlans, filters]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = useMemo(
    () => filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    [filtered, page],
  );

  const isDirty = useMemo(() => {
    if (views.activeId == null) return Object.values(filters).some(Boolean);
    const active = views.views.find((v) => v.id === views.activeId);
    if (!active) return true;
    return JSON.stringify(active.filters) !== JSON.stringify(filters);
  }, [filters, views.activeId, views.views]);

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search)
      pills.push({
        key: "search",
        label: (
          <>
            Search: <strong>{filters.search}</strong>
          </>
        ),
      });
    if (filters.status)
      pills.push({
        key: "status",
        label: (
          <>
            Status:{" "}
            <strong>{STATUS_LABEL[filters.status as StaffingPlanStatus]}</strong>
          </>
        ),
      });
    if (filters.employmentType)
      pills.push({
        key: "employmentType",
        label: (
          <>
            Type:{" "}
            <strong>
              {EMPLOYMENT_TYPE_LABEL[filters.employmentType as EmploymentType]}
            </strong>
          </>
        ),
      });
    if (filters.department)
      pills.push({
        key: "department",
        label: (
          <>
            Dept: <strong>{filters.department}</strong>
          </>
        ),
      });
    return pills;
  }, [filters]);

  const [updatePlan] = useUpdateStaffingPlanMutation();

  const columns: ColumnDef<StaffingPlan>[] = useMemo(
    () => [
      {
        id: "profile",
        header: "Profile",
        width: 240,
        pinned: true,
        sortKey: "profileName",
        copyValue: (p) => p.profileName,
        cell: (p) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{p.profileName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {p.designation}
              {p.planCode ? ` · ${p.planCode}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        sortKey: "status",
        copyValue: (p) => STATUS_LABEL[p.status],
        cell: (p) => (
          <InlineEditCell<StaffingPlanStatus>
            mode="select"
            value={p.status}
            stopRowClick
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            render={(v) => (
              <Badge variant={STATUS_VARIANT[v]} className="text-[10px]">
                {STATUS_LABEL[v]}
              </Badge>
            )}
            onSave={async (next) => {
              try {
                await updatePlan({
                  id: p.id,
                  body: { status: next },
                }).unwrap();
              } catch (err: any) {
                toast({
                  title: "Update failed",
                  description: err?.data?.error ?? err?.message,
                  variant: "destructive",
                });
                throw err;
              }
            }}
          />
        ),
      },
      {
        id: "department",
        header: "Department",
        width: 150,
        sortKey: "department",
        copyValue: (p) => p.department,
        cell: (p) => <span className="truncate text-sm">{p.department}</span>,
      },
      {
        id: "employmentType",
        header: "Type",
        width: 120,
        sortKey: "employmentType",
        copyValue: (p) => EMPLOYMENT_TYPE_LABEL[p.employmentType],
        cell: (p) => (
          <Badge variant="outline" className="text-[10px]">
            {EMPLOYMENT_TYPE_LABEL[p.employmentType]}
          </Badge>
        ),
      },
      {
        id: "vacancies",
        header: "Vacancies",
        width: 100,
        align: "right",
        sortKey: "vacancies",
        copyValue: (p) => String(p.vacancies),
        cell: (p) => (
          <span className="tabular-nums font-medium">{p.vacancies}</span>
        ),
      },
      {
        id: "cpp",
        header: "Cost / person",
        width: 130,
        align: "right",
        defaultHidden: true,
        copyValue: (p) => String(toNum(p.estimatedCostPerPerson)),
        cell: (p) => (
          <span className="tabular-nums text-sm text-muted-foreground">
            ₹{formatINR(toNum(p.estimatedCostPerPerson))}
          </span>
        ),
      },
      {
        id: "total",
        header: "Total cost",
        width: 140,
        align: "right",
        sortKey: "totalEstimatedCost",
        copyValue: (p) => String(toNum(p.totalEstimatedCost)),
        cell: (p) => (
          <span className="font-semibold tabular-nums">
            ₹{formatINR(toNum(p.totalEstimatedCost))}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 110,
        sortKey: "createdAt",
        copyValue: (p) => formatDate(p.createdAt),
        cell: (p) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(p.createdAt)}
          </span>
        ),
      },
    ],
    [updatePlan, toast],
  );

  return (
    <>
    <WorkspaceShell
      scope="staffing-plans"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Briefcase className="h-4 w-4" />}
            title="Staffing Plan"
            subtitle={`${total.toLocaleString()} plan${total === 1 ? "" : "s"}${
              isFetching ? " · syncing…" : ""
            }`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search profile, designation…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    updateFilter("search", searchInput.trim());
                  if (e.key === "Escape") {
                    setSearchInput("");
                    updateFilter("search", "");
                  }
                }}
                className="pl-8 h-8 w-56 text-sm"
              />
            </div>
            <Button
              size="sm"
              className="h-8"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> New plan
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
              onSaveOver={() =>
                views.activeId && views.update(views.activeId, { filters })
              }
            />
          </div>

          <div className="px-4 sm:px-6 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-3">
            <FilterChips
              label="Status"
              value={filters.status}
              onChange={(v) => updateFilter("status", v)}
              options={STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                tint: o.tint,
              }))}
            />
            <FilterChips
              label="Type"
              value={filters.employmentType}
              onChange={(v) => updateFilter("employmentType", v)}
              options={Object.entries(EMPLOYMENT_TYPE_LABEL).map(
                ([value, label]) => ({
                  value: value as EmploymentType,
                  label,
                }),
              )}
            />
            <div className="flex items-center gap-1">
              <select
                value={filters.department}
                onChange={(e) => updateFilter("department", e.target.value)}
                className="h-7 rounded-md border bg-background px-2 text-xs"
              >
                <option value="">All departments</option>
                {departmentOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <ActiveFilterPills
              filters={activeFilterPills}
              onClear={(k) => updateFilter(k as keyof Filters, "" as any)}
              onClearAll={() => {
                setFilters(EMPTY_FILTERS);
                setSearchInput("");
                setPage(0);
              }}
            />
          </div>
        </>
      }
      list={
        <div className="flex flex-col h-full">
          <div className="flex-1 min-h-0">
            <DataTable<StaffingPlan>
              tableId="staffing-plans-list"
              columns={columns}
              rows={items}
              rowId={(p) => p.id}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(p) => setSelectedId(p.id)}
              emptyState={
                <div className="py-10">
                  <Briefcase className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No staffing plans match these filters.</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setSearchInput("");
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              }
            />
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-2 border-t bg-background/95 text-xs">
              <span className="text-muted-foreground tabular-nums">
                Page {page + 1} of {pages} · {total.toLocaleString()} total
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || isFetching}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="h-7"
                >
                  <ChevronLeft className="h-3 w-3" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page + 1 >= pages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                  className="h-7"
                >
                  <ChevronRight className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}
        </div>
      }
      preview={selectedId ? <PlanPreview id={selectedId} /> : null}
      previewHeader={
        selectedId ? (
          <PreviewHeader
            id={selectedId}
            onEdit={() => setEditId(selectedId)}
            onDeleted={() => setSelectedId(null)}
          />
        ) : null
      }
    />

    <Sheet open={createOpen} onOpenChange={setCreateOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle>New staffing plan</SheetTitle>
          <SheetDescription>
            Capture the role, vacancies and cost estimate. The plan ID is
            generated automatically on save.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 sm:px-6 py-5">
          <StaffingPlanForm
            submitLabel="Save plan"
            submitting={creating}
            departmentOptions={employeeDepartments}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (payload) => {
              try {
                await createPlan(payload).unwrap();
                toast({ title: "Staffing plan created" });
                setCreateOpen(false);
              } catch (e: any) {
                toast({
                  title: "Could not create plan",
                  description:
                    e?.data?.error ||
                    e?.message ||
                    "Server rejected the request",
                  variant: "destructive",
                });
              }
            }}
          />
        </div>
      </SheetContent>
    </Sheet>

    <Sheet open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle>Edit staffing plan</SheetTitle>
          <SheetDescription>
            Update the role, vacancies and cost estimate.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 sm:px-6 py-5">
          {editId && (
            <EditPlanForm
              id={editId}
              departmentOptions={employeeDepartments}
              onDone={() => setEditId(null)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

function EditPlanForm({
  id,
  departmentOptions,
  onDone,
}: {
  id: string;
  departmentOptions: string[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetStaffingPlanQuery(id);
  const [updatePlan, { isLoading: saving }] = useUpdateStaffingPlanMutation();

  if (isLoading || !data?.plan) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <StaffingPlanForm
      initial={data.plan}
      submitLabel="Save changes"
      submitting={saving}
      departmentOptions={departmentOptions}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          await updatePlan({ id, body: payload }).unwrap();
          toast({ title: "Staffing plan updated" });
          onDone();
        } catch (e: any) {
          toast({
            title: "Could not save changes",
            description:
              e?.data?.error ||
              e?.message ||
              "Server rejected the request",
            variant: "destructive",
          });
        }
      }}
    />
  );
}

function PreviewHeader({
  id,
  onEdit,
  onDeleted,
}: {
  id: string;
  onEdit: () => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const { data } = useGetStaffingPlanQuery(id);
  const [removePlan, { isLoading: deleting }] = useDeleteStaffingPlanMutation();
  const p = data?.plan;
  if (!p) return <Skeleton className="h-5 w-40" />;

  const onDelete = async () => {
    if (!confirm(`Delete staffing plan "${p.profileName}"? This cannot be undone.`))
      return;
    try {
      await removePlan(p.id).unwrap();
      toast({ title: "Staffing plan deleted" });
      onDeleted();
    } catch (e: any) {
      toast({
        title: "Could not delete",
        description: e?.data?.error || e?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={STATUS_VARIANT[p.status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[p.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{p.profileName}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 ml-auto"
        title="Edit"
        onClick={onEdit}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
        title="Delete"
        disabled={deleting}
        onClick={onDelete}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function PlanPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetStaffingPlanQuery(id);
  const p = data?.plan;

  if (isLoading || !p) {
    return (
      <div className="p-4 sm:p-5 space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-5 space-y-5 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold">{p.profileName}</h2>
        <div className="text-sm text-muted-foreground mt-0.5">
          {p.designation} · {p.department}
        </div>
        {p.planCode && (
          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
            {p.planCode}
          </div>
        )}
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
          <Calculator className="h-3.5 w-3.5" />
          Total estimated cost
        </div>
        <div className="text-3xl font-bold tabular-nums">
          ₹{formatINR(toNum(p.totalEstimatedCost))}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {p.vacancies} vacanc{p.vacancies === 1 ? "y" : "ies"} ·
          {" "}₹{formatINR(toNum(p.estimatedCostPerPerson))} per person
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Plan ID" value={p.id} />
        <Fact
          label="Status"
          value={
            <Badge variant={STATUS_VARIANT[p.status]} className="text-[10px]">
              {STATUS_LABEL[p.status]}
            </Badge>
          }
        />
        <Fact icon={Layers} label="Department" value={p.department} />
        <Fact icon={Briefcase} label="Designation" value={p.designation} />
        <Fact
          icon={UsersIcon}
          label="Employment type"
          value={EMPLOYMENT_TYPE_LABEL[p.employmentType]}
        />
        <Fact label="Vacancies" value={String(p.vacancies)} />
        <Fact
          label="Cost per person"
          value={`₹${formatINR(toNum(p.estimatedCostPerPerson))}`}
        />
        <Fact icon={Calendar} label="Created" value={formatDate(p.createdAt)} />
        {p.createdBy && (
          <Fact
            label="Created by"
            value={
              `${p.createdBy.first_name ?? ""} ${p.createdBy.last_name ?? ""}`.trim() ||
              p.createdBy.email
            }
          />
        )}
      </div>

      {p.notes && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Notes
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {p.notes}
          </p>
        </Card>
      )}
    </div>
  );
}

function Fact({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: any;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="font-medium flex items-center gap-1.5 break-all">
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        {value}
      </div>
    </div>
  );
}
