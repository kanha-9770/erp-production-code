"use client";

/**
 * Job Openings — recruitment workspace.
 *
 * Mirrors /staffing-plan / /employee-master: resizable list + preview,
 * persisted column visibility/sort, saved filter views, status inline-edit
 * and a row preview drawer. "+ New opening" opens an in-page Sheet.
 */

import { useMemo, useState } from "react";
import {
  useGetJobOpeningsQuery,
  useGetJobOpeningQuery,
  useUpdateJobOpeningMutation,
  useCreateJobOpeningMutation,
  useDeleteJobOpeningMutation,
  type JobOpening,
  type JobOpeningStatus,
} from "@/lib/api/job-openings";
import {
  useGetStaffingPlansQuery,
  type EmploymentType,
} from "@/lib/api/staffing-plans";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Megaphone,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Layers,
  Users as UsersIcon,
  Calendar,
  Globe,
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
import { JobOpeningForm } from "@/components/job-opening/job-opening-form";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<JobOpeningStatus, string> = {
  DRAFT: "Draft",
  OPEN: "Open",
  ON_HOLD: "On hold",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const STATUS_VARIANT: Record<
  JobOpeningStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  OPEN: "default",
  ON_HOLD: "outline",
  CLOSED: "outline",
  CANCELLED: "destructive",
};

const STATUS_OPTIONS: Array<{
  value: JobOpeningStatus;
  label: string;
  tint: string;
}> = [
  { value: "DRAFT", label: "Draft", tint: "#9ca3af" },
  { value: "OPEN", label: "Open", tint: "#22c55e" },
  { value: "ON_HOLD", label: "On hold", tint: "#f59e0b" },
  { value: "CLOSED", label: "Closed", tint: "#0ea5e9" },
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
  publishedOnly: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  employmentType: "",
  department: "",
  publishedOnly: "",
};

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

export default function JobOpeningListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createOpening, { isLoading: creating }] = useCreateJobOpeningMutation();

  const views = useSavedViews<Filters>("job-openings");

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

  const { data, isLoading, isFetching } = useGetJobOpeningsQuery();
  const allOpenings = useMemo(() => data?.openings ?? [], [data?.openings]);

  // Pre-load staffing plans so the create-sheet's plan picker is instant.
  const { data: plansData } = useGetStaffingPlansQuery();
  const plans = useMemo(() => plansData?.plans ?? [], [plansData]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    allOpenings.forEach((o) => {
      const d = (o.department ?? "").trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allOpenings]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allOpenings.filter((o) => {
      if (filters.status && o.status !== filters.status) return false;
      if (filters.employmentType && o.employmentType !== filters.employmentType)
        return false;
      if (filters.department && o.department !== filters.department)
        return false;
      if (filters.publishedOnly === "yes" && !o.publishOnWebsite) return false;
      if (filters.publishedOnly === "no" && o.publishOnWebsite) return false;
      if (!q) return true;
      return (
        o.profileName?.toLowerCase().includes(q) ||
        o.department?.toLowerCase().includes(q) ||
        o.designation?.toLowerCase().includes(q) ||
        (o.jobCode ?? "").toLowerCase().includes(q) ||
        o.id?.toLowerCase().includes(q)
      );
    });
  }, [allOpenings, filters]);

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
            <strong>{STATUS_LABEL[filters.status as JobOpeningStatus]}</strong>
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
    if (filters.publishedOnly)
      pills.push({
        key: "publishedOnly",
        label: (
          <>
            Public:{" "}
            <strong>{filters.publishedOnly === "yes" ? "yes" : "no"}</strong>
          </>
        ),
      });
    return pills;
  }, [filters]);

  const [updateOpening] = useUpdateJobOpeningMutation();

  const columns: ColumnDef<JobOpening>[] = useMemo(
    () => [
      {
        id: "profile",
        header: "Profile",
        width: 240,
        pinned: true,
        sortKey: "profileName",
        copyValue: (o) => o.profileName,
        cell: (o) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{o.profileName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {o.designation}
              {o.jobCode ? ` · ${o.jobCode}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        sortKey: "status",
        copyValue: (o) => STATUS_LABEL[o.status],
        cell: (o) => (
          <InlineEditCell<JobOpeningStatus>
            mode="select"
            value={o.status}
            stopRowClick
            options={STATUS_OPTIONS.map((s) => ({
              value: s.value,
              label: s.label,
            }))}
            render={(v) => (
              <Badge variant={STATUS_VARIANT[v]} className="text-[10px]">
                {STATUS_LABEL[v]}
              </Badge>
            )}
            onSave={async (next) => {
              try {
                await updateOpening({
                  id: o.id,
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
        copyValue: (o) => o.department,
        cell: (o) => <span className="truncate text-sm">{o.department}</span>,
      },
      {
        id: "employmentType",
        header: "Type",
        width: 120,
        sortKey: "employmentType",
        copyValue: (o) => EMPLOYMENT_TYPE_LABEL[o.employmentType],
        cell: (o) => (
          <Badge variant="outline" className="text-[10px]">
            {EMPLOYMENT_TYPE_LABEL[o.employmentType]}
          </Badge>
        ),
      },
      {
        id: "vacancies",
        header: "Vacancies",
        width: 100,
        align: "right",
        sortKey: "vacancies",
        copyValue: (o) => String(o.vacancies),
        cell: (o) => (
          <span className="tabular-nums font-medium">{o.vacancies}</span>
        ),
      },
      {
        id: "salaryApprox",
        header: "Salary",
        width: 130,
        defaultHidden: true,
        copyValue: (o) => o.salaryApprox ?? "",
        cell: (o) => (
          <span className="text-sm text-muted-foreground">
            {o.salaryApprox ?? "—"}
          </span>
        ),
      },
      {
        id: "publishOnWebsite",
        header: "Public",
        width: 90,
        sortKey: "publishOnWebsite",
        copyValue: (o) => (o.publishOnWebsite ? "yes" : "no"),
        cell: (o) =>
          o.publishOnWebsite ? (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
            >
              <Globe className="h-3 w-3 mr-1" />
              Public
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "plan",
        header: "Plan",
        width: 160,
        defaultHidden: true,
        copyValue: (o) => o.staffingPlan?.profileName ?? "",
        cell: (o) => (
          <span className="truncate text-xs text-muted-foreground">
            {o.staffingPlan?.profileName ?? "—"}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 110,
        sortKey: "createdAt",
        copyValue: (o) => formatDate(o.createdAt),
        cell: (o) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(o.createdAt)}
          </span>
        ),
      },
    ],
    [updateOpening, toast],
  );

  return (
    <>
      <WorkspaceShell
        scope="job-openings"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<Megaphone className="h-4 w-4" />}
              title="Job Opening"
              subtitle={`${total.toLocaleString()} opening${
                total === 1 ? "" : "s"
              }${isFetching ? " · syncing…" : ""}`}
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
                <Plus className="h-3.5 w-3.5 mr-1" /> New opening
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
              <FilterChips
                label="Public"
                value={filters.publishedOnly}
                onChange={(v) => updateFilter("publishedOnly", v)}
                options={[
                  { value: "yes", label: "On website" },
                  { value: "no", label: "Internal" },
                ]}
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
              <DataTable<JobOpening>
                tableId="job-openings-list"
                columns={columns}
                rows={items}
                rowId={(o) => o.id}
                isLoading={isLoading}
                selectedId={selectedId}
                onRowClick={(o) => setSelectedId(o.id)}
                emptyState={
                  <div className="py-10">
                    <Megaphone className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>No job openings match these filters.</p>
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
        preview={selectedId ? <OpeningPreview id={selectedId} /> : null}
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
            <SheetTitle>New job opening</SheetTitle>
            <SheetDescription>
              Pick a staffing plan to auto-fill the role, or fill the fields
              manually for an ad-hoc opening.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            <JobOpeningForm
              submitLabel="Save opening"
              submitting={creating}
              staffingPlans={plans}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                try {
                  await createOpening(payload).unwrap();
                  toast({ title: "Job opening created" });
                  setCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: "Could not create opening",
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
            <SheetTitle>Edit job opening</SheetTitle>
            <SheetDescription>
              Update the role, description and publication settings.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            {editId && (
              <EditOpeningForm
                id={editId}
                staffingPlans={plans}
                onDone={() => setEditId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function EditOpeningForm({
  id,
  staffingPlans,
  onDone,
}: {
  id: string;
  staffingPlans: any[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetJobOpeningQuery(id);
  const [updateOpening, { isLoading: saving }] = useUpdateJobOpeningMutation();

  if (isLoading || !data?.opening) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <JobOpeningForm
      initial={data.opening}
      submitLabel="Save changes"
      submitting={saving}
      staffingPlans={staffingPlans}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          await updateOpening({ id, body: payload }).unwrap();
          toast({ title: "Job opening updated" });
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
  const { data } = useGetJobOpeningQuery(id);
  const [removeOpening, { isLoading: deleting }] =
    useDeleteJobOpeningMutation();
  const o = data?.opening;
  if (!o) return <Skeleton className="h-5 w-40" />;

  const onDelete = async () => {
    if (
      !confirm(
        `Delete job opening "${o.profileName}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await removeOpening(o.id).unwrap();
      toast({ title: "Job opening deleted" });
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
      <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[o.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{o.profileName}</span>
      {o.publishOnWebsite && (
        <Badge
          variant="outline"
          className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 shrink-0"
        >
          <Globe className="h-3 w-3 mr-1" />
          Public
        </Badge>
      )}
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

function OpeningPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetJobOpeningQuery(id);
  const o = data?.opening;

  if (isLoading || !o) {
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
        <h2 className="text-xl font-bold">{o.profileName}</h2>
        <div className="text-sm text-muted-foreground mt-0.5">
          {o.designation} · {o.department}
        </div>
        {o.jobCode && (
          <div className="text-xs text-muted-foreground mt-0.5 font-mono">
            {o.jobCode}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px]">
          {STATUS_LABEL[o.status]}
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          {EMPLOYMENT_TYPE_LABEL[o.employmentType]}
        </Badge>
        {o.publishOnWebsite && (
          <Badge
            variant="outline"
            className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
          >
            <Globe className="h-3 w-3 mr-1" />
            On career page
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact icon={Layers} label="Department" value={o.department} />
        <Fact icon={UsersIcon} label="Vacancies" value={String(o.vacancies)} />
        <Fact label="Salary approx" value={o.salaryApprox ?? "—"} />
        <Fact icon={Calendar} label="Created" value={formatDate(o.createdAt)} />
        {o.staffingPlan && (
          <Fact
            label="Staffing plan"
            value={
              o.staffingPlan.profileName +
              (o.staffingPlan.planCode ? ` · ${o.staffingPlan.planCode}` : "")
            }
          />
        )}
        {o.createdBy && (
          <Fact
            label="Created by"
            value={
              `${o.createdBy.first_name ?? ""} ${o.createdBy.last_name ?? ""}`.trim() ||
              o.createdBy.email
            }
          />
        )}
      </div>

      <Card className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
          Job description
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-line">
          {o.jobDescription}
        </p>
      </Card>
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
