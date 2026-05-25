"use client";

/**
 * Employee Referrals — recruitment workspace.
 *
 * Same workspace pattern as /job-application: resizable list + preview,
 * inline-edit status, filter chips, saved views, in-page create Sheet.
 */


import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetEmployeeReferralsQuery,
  useGetEmployeeReferralQuery,
  useUpdateEmployeeReferralMutation,
  useCreateEmployeeReferralMutation,
  useDeleteEmployeeReferralMutation,
  type EmployeeReferral,
  type EmployeeReferralStatus,
} from "@/lib/api/employee-referrals";
import { useGetEmployeeListQuery } from "@/lib/api/employees";
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
  UserPlus,
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
  Layers,
  Users as UsersIcon,
  ExternalLink,
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
  ManageColumnsButton,
} from "@/components/real-estate/workspace";
import {
  StaticFilterSidebar,
  applyStaticFilters,
  type FieldFilter,
  type StaticFilterField,
} from "@/components/static-filter";
import { useToast } from "@/hooks/use-toast";
import { EmployeeReferralForm } from "@/components/employee-referral/employee-referral-form";
import { STATUS_OPTIONS as FORM_STATUS_OPTIONS } from "@/components/employee-referral/employee-referral-form";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<EmployeeReferralStatus, string> = {
  NEW: "New",
  REVIEWED: "Reviewed",
  INTERVIEWING: "Interviewing",
  HIRED: "Hired",
  REJECTED: "Rejected",
};

const STATUS_VARIANT: Record<
  EmployeeReferralStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  NEW: "default",
  REVIEWED: "secondary",
  INTERVIEWING: "secondary",
  HIRED: "default",
  REJECTED: "destructive",
};

const STATUS_TINT: Record<EmployeeReferralStatus, string> = {
  NEW: "#3b82f6",
  REVIEWED: "#a855f7",
  INTERVIEWING: "#0ea5e9",
  HIRED: "#22c55e",
  REJECTED: "#ef4444",
};

interface Filters {
  search: string;
  status: string;
  referringEmployeeId: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  referringEmployeeId: "",
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

const FILTER_FIELDS: StaticFilterField<EmployeeReferral>[] = [
  {
    id: "applicantName",
    label: "Applicant Name",
    type: "text",
    accessor: (r) => r.applicantName,
  },
  {
    id: "applicantEmail",
    label: "Applicant Email",
    type: "text",
    accessor: (r) => r.applicantEmail,
  },
  {
    id: "applicantMobile",
    label: "Applicant Mobile",
    type: "text",
    accessor: (r) => r.applicantMobile,
  },
  {
    id: "designation",
    label: "Designation",
    type: "text",
    accessor: (r) => r.designation,
  },
  {
    id: "status",
    label: "Status",
    type: "select",
    accessor: (r) => r.status,
    options: (Object.entries(STATUS_LABEL) as [EmployeeReferralStatus, string][])
      .map(([value, label]) => ({ value, label })),
  },
  {
    id: "referrerFirstName",
    label: "Referrer",
    type: "text",
    accessor: (r) => r.referrerFirstName,
  },
  {
    id: "referrerDepartment",
    label: "Referrer Department",
    type: "text",
    accessor: (r) => r.referrerDepartment,
  },
  {
    id: "referralDate",
    label: "Referral Date",
    type: "date",
    accessor: (r) => r.referralDate,
  },
  {
    id: "referralCode",
    label: "Referral Code",
    type: "text",
    accessor: (r) => r.referralCode,
  },
  {
    id: "createdAt",
    label: "Created Date",
    type: "date",
    accessor: (r) => r.createdAt,
  },
];

export default function EmployeeReferralListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
  const [createReferral, { isLoading: creating }] =
    useCreateEmployeeReferralMutation();

  const views = useSavedViews<Filters>("employee-referrals");

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

  const { data, isLoading, isFetching } = useGetEmployeeReferralsQuery();
  const allReferrals = useMemo(() => data?.referrals ?? [], [data?.referrals]);

  // Pre-load employees so the create-sheet picker is instant and the filter
  // dropdown can show referrer names.
  const { data: empData } = useGetEmployeeListQuery();
  const employees = useMemo(() => empData?.employees ?? [], [empData]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    const base = allReferrals.filter((r) => {
      if (filters.status && r.status !== filters.status) return false;
      if (
        filters.referringEmployeeId &&
        r.referringEmployeeId !== filters.referringEmployeeId
      )
        return false;
      if (!q) return true;
      return (
        r.applicantName?.toLowerCase().includes(q) ||
        r.applicantEmail?.toLowerCase().includes(q) ||
        r.applicantMobile?.toLowerCase().includes(q) ||
        (r.designation ?? "").toLowerCase().includes(q) ||
        (r.referrerFirstName ?? "").toLowerCase().includes(q) ||
        (r.referrerDepartment ?? "").toLowerCase().includes(q) ||
        (r.referralCode ?? "").toLowerCase().includes(q) ||
        r.id?.toLowerCase().includes(q)
      );
    });
    return applyStaticFilters(base, FILTER_FIELDS, fieldFilters);
  }, [allReferrals, filters, fieldFilters]);

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
              {STATUS_LABEL[filters.status as EmployeeReferralStatus]}
            </strong>
          </>
        ),
      });
    if (filters.referringEmployeeId) {
      const emp = employees.find(
        (e) => e.id === filters.referringEmployeeId,
      );
      pills.push({
        key: "referringEmployeeId",
        label: (
          <>
            Referrer:{" "}
            <strong>
              {emp?.employeeName ?? filters.referringEmployeeId}
            </strong>
          </>
        ),
      });
    }
    return pills;
  }, [filters, employees]);

  const [updateReferral] = useUpdateEmployeeReferralMutation();

  const columns: ColumnDef<EmployeeReferral>[] = useMemo(
    () => [
      {
        id: "avatar",
        header: "",
        width: 56,
        pinned: true,
        copyValue: () => "",
        cell: (r) => (
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-[11px] font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0"
            aria-hidden
          >
            {initialsOf(r.applicantName)}
          </div>
        ),
      },
      {
        id: "applicant",
        header: "Applicant",
        width: 220,
        pinned: true,
        sortKey: "applicantName",
        copyValue: (r) => r.applicantName,
        cell: (r) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{r.applicantName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {r.applicantEmail}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        sortKey: "status",
        copyValue: (r) => STATUS_LABEL[r.status],
        cell: (r) => (
          <InlineEditCell<EmployeeReferralStatus>
            mode="select"
            value={r.status}
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
                await updateReferral({
                  id: r.id,
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
        id: "referrer",
        header: "Referrer",
        width: 200,
        copyValue: (r) =>
          r.referringEmployee?.employeeName ?? r.referrerFirstName,
        cell: (r) => (
          <div className="min-w-0">
            <div className="text-sm truncate">
              {r.referringEmployee?.employeeName ?? r.referrerFirstName}
            </div>
            {r.referrerDepartment && (
              <div className="text-[10px] text-muted-foreground truncate">
                {r.referrerDepartment}
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
        copyValue: (r) => r.designation ?? "",
        cell: (r) => (
          <span className="truncate text-sm">{r.designation ?? "—"}</span>
        ),
      },
      {
        id: "referralDate",
        header: "Referral date",
        width: 120,
        sortKey: "referralDate",
        copyValue: (r) => formatDate(r.referralDate),
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(r.referralDate)}
          </span>
        ),
      },
      {
        id: "mobile",
        header: "Phone",
        width: 130,
        defaultHidden: true,
        copyValue: (r) => r.applicantMobile,
        cell: (r) => (
          <span className="text-sm tabular-nums truncate">
            {r.applicantMobile}
          </span>
        ),
      },
      {
        id: "resume",
        header: "Resume",
        width: 100,
        copyValue: (r) => r.applicantResumeUrl ?? "",
        cell: (r) =>
          r.applicantResumeUrl ? (
            <a
              href={r.applicantResumeUrl}
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
        id: "code",
        header: "Code",
        width: 110,
        defaultHidden: true,
        copyValue: (r) => r.referralCode ?? "",
        cell: (r) => (
          <span className="text-xs font-mono text-muted-foreground">
            {r.referralCode ?? "—"}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 110,
        defaultHidden: true,
        sortKey: "createdAt",
        copyValue: (r) => formatDate(r.createdAt),
        cell: (r) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(r.createdAt)}
          </span>
        ),
      },
    ],
    [updateReferral, toast],
  );

  return (
    <>
      <WorkspaceShell
        scope="employee-referrals"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<UserPlus className="h-4 w-4" />}
              title="Employee Referral"
              subtitle={`${total.toLocaleString()} referral${
                total === 1 ? "" : "s"
              }${isFetching ? " · syncing…" : ""}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search applicant, referrer, code…"
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
              <ManageColumnsButton
                tableId="employee-referrals-list"
                columns={columns}
                variant="dialog"
              />
              <Button
                size="sm"
                className="h-8"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3.5 w-3.5 mr-1" /> New referral
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
              <div className="flex items-center gap-1">
                <select
                  value={filters.referringEmployeeId}
                  onChange={(e) =>
                    updateFilter("referringEmployeeId", e.target.value)
                  }
                  className="h-7 rounded-md border bg-background px-2 text-xs max-w-[220px]"
                >
                  <option value="">All referrers</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.employeeName}
                      {emp.department ? ` · ${emp.department}` : ""}
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
              <DataTable<EmployeeReferral>
                tableId="employee-referrals-list"
                columns={columns}
                rows={items}
                rowId={(r) => r.id}
                pageSize={10}
                isLoading={isLoading}
                selectedId={selectedId}
                onRowClick={(r) => setSelectedId(r.id)}
                emptyState={
                  <div className="py-10">
                    <UserPlus className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>No employee referrals match these filters.</p>
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
        preview={selectedId ? <ReferralPreview id={selectedId} /> : null}
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
            <SheetTitle>New employee referral</SheetTitle>
            <SheetDescription>
              Capture the referred candidate and the referring employee. The
              referrer's first name and department auto-fill from Employee
              Master.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            <EmployeeReferralForm
              submitLabel="Save referral"
              submitting={creating}
              employees={employees}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                try {
                  await createReferral(payload).unwrap();
                  toast({ title: "Employee referral created" });
                  setCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: "Could not create referral",
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
            <SheetTitle>Edit employee referral</SheetTitle>
            <SheetDescription>
              Update the referred candidate and screening status.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            {editId && (
              <EditReferralForm
                id={editId}
                employees={employees}
                onDone={() => setEditId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StaticFilterSidebar<EmployeeReferral>
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fields={FILTER_FIELDS}
        filters={fieldFilters}
        onFiltersChange={setFieldFilters}
        records={allReferrals}
      />
    </>
  );
}

function EditReferralForm({
  id,
  employees,
  onDone,
}: {
  id: string;
  employees: any[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetEmployeeReferralQuery(id);
  const [updateReferral, { isLoading: saving }] =
    useUpdateEmployeeReferralMutation();

  if (isLoading || !data?.referral) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <EmployeeReferralForm
      initial={data.referral}
      submitLabel="Save changes"
      submitting={saving}
      employees={employees}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          await updateReferral({ id, body: payload }).unwrap();
          toast({ title: "Employee referral updated" });
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
  const { data } = useGetEmployeeReferralQuery(id);
  const [removeReferral, { isLoading: deleting }] =
    useDeleteEmployeeReferralMutation();
  const r = data?.referral;
  if (!r) return <Skeleton className="h-5 w-40" />;

  const onDelete = async () => {
    if (
      !confirm(
        `Delete referral for "${r.applicantName}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await removeReferral(r.id).unwrap();
      toast({ title: "Employee referral deleted" });
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
      <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[r.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{r.applicantName}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/hr/recruitment/employee-referral/${r.id}`} title="Open full details">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
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

function ReferralPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetEmployeeReferralQuery(id);
  const r = data?.referral;

  if (isLoading || !r) {
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
          {initialsOf(r.applicantName)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{r.applicantName}</h2>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" />
              {r.applicantEmail}
            </span>
            <span className="inline-flex items-center gap-1">
              <Phone className="h-3 w-3" />
              {r.applicantMobile}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[r.status]} className="text-[10px]">
          {STATUS_LABEL[r.status]}
        </Badge>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(r.referralDate)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Referral ID" value={r.id} />
        {r.referralCode && <Fact label="Code" value={r.referralCode} />}
        {r.designation && (
          <Fact icon={Briefcase} label="Designation" value={r.designation} />
        )}
        <Fact
          icon={UsersIcon}
          label="Referrer"
          value={
            r.referringEmployee?.employeeName ?? r.referrerFirstName
          }
        />
        {r.referrerDepartment && (
          <Fact
            icon={Layers}
            label="Referrer dept"
            value={r.referrerDepartment}
          />
        )}
        {r.createdBy && (
          <Fact
            label="Captured by"
            value={
              `${r.createdBy.first_name ?? ""} ${r.createdBy.last_name ?? ""}`.trim() ||
              r.createdBy.email
            }
          />
        )}
      </div>

      {r.applicantResumeUrl && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Resume
          </div>
          <a
            href={r.applicantResumeUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline break-all"
          >
            <FileText className="h-4 w-4 shrink-0" />
            {r.applicantResumeName || "Open resume"}
          </a>
        </Card>
      )}

      {r.remark && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Remark
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {r.remark}
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
