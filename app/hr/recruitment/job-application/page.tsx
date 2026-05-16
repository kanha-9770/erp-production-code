"use client";

/**
 * Job Applications — recruitment workspace.
 *
 * Same workspace pattern as /employee-master / /staffing-plan /
 * /job-opening: resizable list + preview, inline-edit status, filter chips,
 * saved views, in-page create Sheet (no /new route).
 */

import { useMemo, useState } from "react";
import {
  useGetJobApplicationsQuery,
  useGetJobApplicationQuery,
  useUpdateJobApplicationMutation,
  useCreateJobApplicationMutation,
  useDeleteJobApplicationMutation,
  type JobApplication,
  type JobApplicationStatus,
  type ApplicantSource,
} from "@/lib/api/job-applications";
import { useGetJobOpeningsQuery } from "@/lib/api/job-openings";
import type { EmploymentType } from "@/lib/api/staffing-plans";
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
  Users as UsersIcon,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Filter,
  Mail,
  Phone,
  FileText,
  Calendar,
  Briefcase,
  Star,
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
import {
  StaticFilterSidebar,
  applyStaticFilters,
  type FieldFilter,
  type StaticFilterField,
} from "@/components/static-filter";
import { useToast } from "@/hooks/use-toast";
import { JobApplicationForm } from "@/components/job-application/job-application-form";
import {
  STATUS_OPTIONS as FORM_STATUS_OPTIONS,
  SOURCE_OPTIONS,
} from "@/components/job-application/job-application-form";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<JobApplicationStatus, string> = {
  NEW: "New",
  SCREENING: "Screening",
  INTERVIEWING: "Interviewing",
  SHORTLISTED: "Shortlisted",
  OFFERED: "Offered",
  HIRED: "Hired",
  ON_HOLD: "On hold",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

const STATUS_VARIANT: Record<
  JobApplicationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  NEW: "default",
  SCREENING: "secondary",
  INTERVIEWING: "secondary",
  SHORTLISTED: "outline",
  OFFERED: "outline",
  HIRED: "default",
  ON_HOLD: "outline",
  REJECTED: "destructive",
  WITHDRAWN: "destructive",
};

const STATUS_TINT: Record<JobApplicationStatus, string> = {
  NEW: "#3b82f6",
  SCREENING: "#a855f7",
  INTERVIEWING: "#0ea5e9",
  SHORTLISTED: "#22c55e",
  OFFERED: "#10b981",
  HIRED: "#15803d",
  ON_HOLD: "#f59e0b",
  REJECTED: "#ef4444",
  WITHDRAWN: "#6b7280",
};

const SOURCE_LABEL: Record<ApplicantSource, string> = SOURCE_OPTIONS.reduce(
  (acc, o) => ({ ...acc, [o.value]: o.label }),
  {} as Record<ApplicantSource, string>,
);

interface Filters {
  search: string;
  status: string;
  source: string;
  jobOpeningId: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  source: "",
  jobOpeningId: "",
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

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

const FILTER_FIELDS: StaticFilterField<JobApplication>[] = [
  {
    id: "applicantName",
    label: "Applicant Name",
    type: "text",
    accessor: (a) => a.applicantName,
  },
  {
    id: "applicantEmail",
    label: "Applicant Email",
    type: "text",
    accessor: (a) => a.applicantEmail,
  },
  {
    id: "applicantMobile",
    label: "Applicant Mobile",
    type: "text",
    accessor: (a) => a.applicantMobile,
  },
  {
    id: "designation",
    label: "Designation",
    type: "text",
    accessor: (a) => a.designation,
  },
  {
    id: "department",
    label: "Department",
    type: "text",
    accessor: (a) => a.department,
  },
  {
    id: "status",
    label: "Status",
    type: "select",
    accessor: (a) => a.status,
    options: (Object.entries(STATUS_LABEL) as [JobApplicationStatus, string][])
      .map(([value, label]) => ({ value, label })),
  },
  {
    id: "applicantSource",
    label: "Source",
    type: "select",
    accessor: (a) => a.applicantSource,
    options: SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label })),
  },
  {
    id: "applicantRating",
    label: "Rating",
    type: "number",
    accessor: (a) => a.applicantRating,
  },
  {
    id: "salaryExpectation",
    label: "Salary Expectation",
    type: "text",
    accessor: (a) => a.salaryExpectation,
  },
  {
    id: "createdAt",
    label: "Created Date",
    type: "date",
    accessor: (a) => a.createdAt,
  },
];

export default function JobApplicationListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [createApplication, { isLoading: creating }] =
    useCreateJobApplicationMutation();

  const views = useSavedViews<Filters>("job-applications");

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

  const { data, isLoading, isFetching } = useGetJobApplicationsQuery();
  const allApplications = useMemo(
    () => data?.applications ?? [],
    [data?.applications],
  );

  // Pre-load openings so the create-sheet's picker is instant + power the
  // job-opening filter dropdown.
  const { data: openingsData } = useGetJobOpeningsQuery();
  const openings = useMemo(
    () => openingsData?.openings ?? [],
    [openingsData],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const base = allApplications.filter((a) => {
      if (filters.status && a.status !== filters.status) return false;
      if (filters.source && a.applicantSource !== filters.source) return false;
      if (filters.jobOpeningId && a.jobOpeningId !== filters.jobOpeningId)
        return false;
      if (!q) return true;
      return (
        a.applicantName?.toLowerCase().includes(q) ||
        a.applicantEmail?.toLowerCase().includes(q) ||
        a.applicantMobile?.toLowerCase().includes(q) ||
        (a.designation ?? "").toLowerCase().includes(q) ||
        (a.department ?? "").toLowerCase().includes(q) ||
        (a.applicationCode ?? "").toLowerCase().includes(q) ||
        a.id?.toLowerCase().includes(q)
      );
    });
    return applyStaticFilters(base, FILTER_FIELDS, fieldFilters);
  }, [allApplications, filters, fieldFilters]);

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
            <strong>
              {STATUS_LABEL[filters.status as JobApplicationStatus]}
            </strong>
          </>
        ),
      });
    if (filters.source)
      pills.push({
        key: "source",
        label: (
          <>
            Source:{" "}
            <strong>{SOURCE_LABEL[filters.source as ApplicantSource]}</strong>
          </>
        ),
      });
    if (filters.jobOpeningId) {
      const opening = openings.find((o) => o.id === filters.jobOpeningId);
      pills.push({
        key: "jobOpeningId",
        label: (
          <>
            Opening:{" "}
            <strong>{opening?.profileName ?? filters.jobOpeningId}</strong>
          </>
        ),
      });
    }
    return pills;
  }, [filters, openings]);

  const [updateApplication] = useUpdateJobApplicationMutation();

  const columns: ColumnDef<JobApplication>[] = useMemo(
    () => [
      {
        id: "avatar",
        header: "",
        width: 56,
        pinned: true,
        copyValue: () => "",
        cell: (a) => (
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-[11px] font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0"
            aria-hidden
          >
            {initialsOf(a.applicantName)}
          </div>
        ),
      },
      {
        id: "applicant",
        header: "Applicant",
        width: 240,
        pinned: true,
        sortKey: "applicantName",
        copyValue: (a) => a.applicantName,
        cell: (a) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{a.applicantName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {a.applicantEmail}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        sortKey: "status",
        copyValue: (a) => STATUS_LABEL[a.status],
        cell: (a) => (
          <InlineEditCell<JobApplicationStatus>
            mode="select"
            value={a.status}
            stopRowClick
            options={FORM_STATUS_OPTIONS.map((s) => ({
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
                await updateApplication({
                  id: a.id,
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
        id: "opening",
        header: "Job opening",
        width: 200,
        copyValue: (a) => a.jobOpening?.profileName ?? "",
        cell: (a) => (
          <div className="min-w-0">
            <div className="text-sm truncate">
              {a.jobOpening?.profileName ?? "—"}
            </div>
            {a.jobOpening?.jobCode && (
              <div className="text-[10px] text-muted-foreground truncate font-mono">
                {a.jobOpening.jobCode}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "designation",
        header: "Designation",
        width: 160,
        defaultHidden: true,
        copyValue: (a) => a.designation ?? "",
        cell: (a) => (
          <span className="truncate text-sm">{a.designation ?? "—"}</span>
        ),
      },
      {
        id: "department",
        header: "Department",
        width: 140,
        defaultHidden: true,
        copyValue: (a) => a.department ?? "",
        cell: (a) => (
          <span className="truncate text-sm">{a.department ?? "—"}</span>
        ),
      },
      {
        id: "rating",
        header: "Rating",
        width: 110,
        align: "right",
        sortKey: "applicantRating",
        copyValue: (a) =>
          a.applicantRating != null ? String(a.applicantRating) : "",
        cell: (a) =>
          a.applicantRating != null ? (
            <span className="inline-flex items-center gap-1 text-sm tabular-nums">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {a.applicantRating}
            </span>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "source",
        header: "Source",
        width: 130,
        defaultHidden: true,
        copyValue: (a) => (a.applicantSource ? SOURCE_LABEL[a.applicantSource] : ""),
        cell: (a) => (
          <span className="text-xs text-muted-foreground">
            {a.applicantSource ? SOURCE_LABEL[a.applicantSource] : "—"}
          </span>
        ),
      },
      {
        id: "mobile",
        header: "Phone",
        width: 130,
        defaultHidden: true,
        copyValue: (a) => a.applicantMobile,
        cell: (a) => (
          <span className="text-sm tabular-nums truncate">
            {a.applicantMobile}
          </span>
        ),
      },
      {
        id: "salary",
        header: "Salary exp.",
        width: 110,
        defaultHidden: true,
        copyValue: (a) => a.salaryExpectation ?? "",
        cell: (a) => (
          <span className="text-xs text-muted-foreground">
            {a.salaryExpectation ?? "—"}
          </span>
        ),
      },
      {
        id: "resume",
        header: "Resume",
        width: 100,
        copyValue: (a) => a.applicantResumeUrl ?? "",
        cell: (a) =>
          a.applicantResumeUrl ? (
            <a
              href={a.applicantResumeUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <FileText className="h-3 w-3" />
              View
            </a>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "createdAt",
        header: "Applied",
        width: 110,
        sortKey: "createdAt",
        copyValue: (a) => formatDate(a.createdAt),
        cell: (a) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(a.createdAt)}
          </span>
        ),
      },
    ],
    [updateApplication, toast],
  );

  return (
    <>
      <WorkspaceShell
        scope="job-applications"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<UsersIcon className="h-4 w-4" />}
              title="Job Application"
              subtitle={`${total.toLocaleString()} application${
                total === 1 ? "" : "s"
              }${isFetching ? " · syncing…" : ""}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search name, email, phone…"
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
                variant="outline"
                className="h-8"
                onClick={() => setFilterOpen(true)}
              >
                <Filter className="h-3.5 w-3.5 mr-1" /> Filter
                {fieldFilters.length > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                    {fieldFilters.length}
                  </span>
                )}
              </Button>
              <Button
                size="sm"
                className="h-8"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New application
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
                options={FORM_STATUS_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                  tint: STATUS_TINT[o.value],
                }))}
              />
              <FilterChips
                label="Source"
                value={filters.source}
                onChange={(v) => updateFilter("source", v)}
                options={SOURCE_OPTIONS.map((o) => ({
                  value: o.value,
                  label: o.label,
                }))}
              />
              <div className="flex items-center gap-1">
                <select
                  value={filters.jobOpeningId}
                  onChange={(e) =>
                    updateFilter("jobOpeningId", e.target.value)
                  }
                  className="h-7 rounded-md border bg-background px-2 text-xs"
                >
                  <option value="">All openings</option>
                  {openings.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.profileName}
                      {o.jobCode ? ` · ${o.jobCode}` : ""}
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
              <DataTable<JobApplication>
                tableId="job-applications-list"
                columns={columns}
                rows={items}
                rowId={(a) => a.id}
                isLoading={isLoading}
                selectedId={selectedId}
                onRowClick={(a) => setSelectedId(a.id)}
                emptyState={
                  <div className="py-10">
                    <UsersIcon className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>No job applications match these filters.</p>
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
        preview={selectedId ? <ApplicationPreview id={selectedId} /> : null}
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
            <SheetTitle>New job application</SheetTitle>
            <SheetDescription>
              Pick a job opening to auto-fill the role, then capture the
              applicant details and screening status.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            <JobApplicationForm
              submitLabel="Save application"
              submitting={creating}
              jobOpenings={openings}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                try {
                  await createApplication(payload).unwrap();
                  toast({ title: "Job application created" });
                  setCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: "Could not create application",
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
            <SheetTitle>Edit job application</SheetTitle>
            <SheetDescription>
              Update applicant details and screening status.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            {editId && (
              <EditApplicationForm
                id={editId}
                jobOpenings={openings}
                onDone={() => setEditId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StaticFilterSidebar<JobApplication>
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fields={FILTER_FIELDS}
        filters={fieldFilters}
        onFiltersChange={setFieldFilters}
        records={allApplications}
      />
    </>
  );
}

function EditApplicationForm({
  id,
  jobOpenings,
  onDone,
}: {
  id: string;
  jobOpenings: any[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetJobApplicationQuery(id);
  const [updateApplication, { isLoading: saving }] =
    useUpdateJobApplicationMutation();

  if (isLoading || !data?.application) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <JobApplicationForm
      initial={data.application}
      submitLabel="Save changes"
      submitting={saving}
      jobOpenings={jobOpenings}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          await updateApplication({ id, body: payload }).unwrap();
          toast({ title: "Job application updated" });
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
  const { data } = useGetJobApplicationQuery(id);
  const [removeApplication, { isLoading: deleting }] =
    useDeleteJobApplicationMutation();
  const a = data?.application;
  if (!a) return <Skeleton className="h-5 w-40" />;

  const onDelete = async () => {
    if (
      !confirm(
        `Delete job application from "${a.applicantName}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await removeApplication(a.id).unwrap();
      toast({ title: "Job application deleted" });
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
      <Badge variant={STATUS_VARIANT[a.status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[a.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{a.applicantName}</span>
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

function ApplicationPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetJobApplicationQuery(id);
  const a = data?.application;

  if (isLoading || !a) {
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
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-md flex items-center justify-center text-base font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0">
          {initialsOf(a.applicantName)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{a.applicantName}</h2>
          <div className="text-sm text-muted-foreground mt-0.5 truncate">
            {a.designation ?? "—"} · {a.department ?? "—"}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" />
              {a.applicantEmail}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {a.applicantMobile}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[a.status]} className="text-[10px]">
          {STATUS_LABEL[a.status]}
        </Badge>
        {a.applicantSource && (
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABEL[a.applicantSource]}
          </Badge>
        )}
        {a.applicantRating != null && (
          <span className="inline-flex items-center gap-1 text-xs">
            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
            {a.applicantRating} / 5
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Application ID" value={a.id} />
        {a.jobOpening && (
          <Fact
            icon={Briefcase}
            label="Job opening"
            value={
              a.jobOpening.profileName +
              (a.jobOpening.jobCode ? ` · ${a.jobOpening.jobCode}` : "")
            }
          />
        )}
        <Fact label="Salary expectation" value={a.salaryExpectation ?? "—"} />
        <Fact icon={Calendar} label="Applied" value={formatDate(a.createdAt)} />
        {a.createdBy && (
          <Fact
            label="Captured by"
            value={
              `${a.createdBy.first_name ?? ""} ${a.createdBy.last_name ?? ""}`.trim() ||
              a.createdBy.email
            }
          />
        )}
      </div>

      {a.applicantResumeUrl && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Resume
          </div>
          <a
            href={a.applicantResumeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline break-all"
          >
            <FileText className="h-4 w-4 shrink-0" />
            {a.applicantResumeName || "Open resume"}
          </a>
        </Card>
      )}

      {a.coverLetter && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Cover letter
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {a.coverLetter}
          </p>
        </Card>
      )}

      {a.jobDescription && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Job description
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {a.jobDescription}
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
