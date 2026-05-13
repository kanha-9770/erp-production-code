"use client";

/**
 * Job Offers — recruitment workspace.
 *
 * Same workspace pattern as /job-application: resizable list + preview,
 * inline-edit status, filter chips, saved views, in-page create Sheet.
 */

import { useMemo, useState } from "react";
import {
  useGetJobOffersQuery,
  useGetJobOfferQuery,
  useUpdateJobOfferMutation,
  useCreateJobOfferMutation,
  useDeleteJobOfferMutation,
  type JobOffer,
  type JobOfferStatus,
} from "@/lib/api/job-offers";
import { useGetJobApplicationsQuery } from "@/lib/api/job-applications";
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
  FileSignature,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Mail,
  Calendar,
  Briefcase,
  Layers,
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
import { JobOfferForm } from "@/components/job-offer/job-offer-form";
import { STATUS_OPTIONS as FORM_STATUS_OPTIONS } from "@/components/job-offer/job-offer-form";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<JobOfferStatus, string> = {
  DRAFT: "Draft",
  SENT: "Sent",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
  EXPIRED: "Expired",
};

const STATUS_VARIANT: Record<
  JobOfferStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  SENT: "default",
  ACCEPTED: "default",
  REJECTED: "destructive",
  WITHDRAWN: "destructive",
  EXPIRED: "outline",
};

const STATUS_TINT: Record<JobOfferStatus, string> = {
  DRAFT: "#9ca3af",
  SENT: "#3b82f6",
  ACCEPTED: "#22c55e",
  REJECTED: "#ef4444",
  WITHDRAWN: "#6b7280",
  EXPIRED: "#f59e0b",
};

interface Filters {
  search: string;
  status: string;
  jobApplicationId: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  jobApplicationId: "",
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

export default function JobOfferListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [createOffer, { isLoading: creating }] = useCreateJobOfferMutation();

  const views = useSavedViews<Filters>("job-offers");

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

  const { data, isLoading, isFetching } = useGetJobOffersQuery();
  const allOffers = useMemo(() => data?.offers ?? [], [data?.offers]);

  // Pre-load applications so the create-sheet picker is instant and the
  // filter dropdown can show applicant names.
  const { data: appsData } = useGetJobApplicationsQuery();
  const applications = useMemo(
    () => appsData?.applications ?? [],
    [appsData],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allOffers.filter((o) => {
      if (filters.status && o.status !== filters.status) return false;
      if (
        filters.jobApplicationId &&
        o.jobApplicationId !== filters.jobApplicationId
      )
        return false;
      if (!q) return true;
      return (
        o.applicantName?.toLowerCase().includes(q) ||
        (o.applicantEmail ?? "").toLowerCase().includes(q) ||
        (o.jobOfferTerm ?? "").toLowerCase().includes(q) ||
        (o.offerCode ?? "").toLowerCase().includes(q) ||
        (o.jobOpening?.profileName ?? "").toLowerCase().includes(q) ||
        o.id?.toLowerCase().includes(q)
      );
    });
  }, [allOffers, filters]);

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
            <strong>{STATUS_LABEL[filters.status as JobOfferStatus]}</strong>
          </>
        ),
      });
    if (filters.jobApplicationId) {
      const app = applications.find((a) => a.id === filters.jobApplicationId);
      pills.push({
        key: "jobApplicationId",
        label: (
          <>
            Applicant:{" "}
            <strong>{app?.applicantName ?? filters.jobApplicationId}</strong>
          </>
        ),
      });
    }
    return pills;
  }, [filters, applications]);

  const [updateOffer] = useUpdateJobOfferMutation();

  const columns: ColumnDef<JobOffer>[] = useMemo(
    () => [
      {
        id: "avatar",
        header: "",
        width: 56,
        pinned: true,
        copyValue: () => "",
        cell: (o) => (
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-[11px] font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0"
            aria-hidden
          >
            {initialsOf(o.applicantName)}
          </div>
        ),
      },
      {
        id: "applicant",
        header: "Applicant",
        width: 220,
        pinned: true,
        sortKey: "applicantName",
        copyValue: (o) => o.applicantName,
        cell: (o) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{o.applicantName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {o.applicantEmail ?? "—"}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        sortKey: "status",
        copyValue: (o) => STATUS_LABEL[o.status],
        cell: (o) => (
          <InlineEditCell<JobOfferStatus>
            mode="select"
            value={o.status}
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
                await updateOffer({
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
        id: "opening",
        header: "Job opening",
        width: 200,
        copyValue: (o) => o.jobOpening?.profileName ?? "",
        cell: (o) => (
          <div className="min-w-0">
            <div className="text-sm truncate">
              {o.jobOpening?.profileName ?? "—"}
            </div>
            {o.jobOpening?.jobCode && (
              <div className="text-[10px] text-muted-foreground truncate font-mono">
                {o.jobOpening.jobCode}
              </div>
            )}
          </div>
        ),
      },
      {
        id: "term",
        header: "Term",
        width: 160,
        defaultHidden: true,
        copyValue: (o) => o.jobOfferTerm ?? "",
        cell: (o) => (
          <span className="text-sm truncate">{o.jobOfferTerm ?? "—"}</span>
        ),
      },
      {
        id: "plan",
        header: "Staffing plan",
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
        id: "offerDate",
        header: "Offer date",
        width: 120,
        sortKey: "offerDate",
        copyValue: (o) => formatDate(o.offerDate),
        cell: (o) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(o.offerDate)}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 110,
        defaultHidden: true,
        sortKey: "createdAt",
        copyValue: (o) => formatDate(o.createdAt),
        cell: (o) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(o.createdAt)}
          </span>
        ),
      },
    ],
    [updateOffer, toast],
  );

  return (
    <>
      <WorkspaceShell
        scope="job-offers"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<FileSignature className="h-4 w-4" />}
              title="Job Offer"
              subtitle={`${total.toLocaleString()} offer${
                total === 1 ? "" : "s"
              }${isFetching ? " · syncing…" : ""}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search applicant, opening, term…"
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
                <Plus className="h-3.5 w-3.5 mr-1" /> New offer
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
                  value={filters.jobApplicationId}
                  onChange={(e) =>
                    updateFilter("jobApplicationId", e.target.value)
                  }
                  className="h-7 rounded-md border bg-background px-2 text-xs max-w-[220px]"
                >
                  <option value="">All applications</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.applicantName}
                      {a.applicationCode ? ` · ${a.applicationCode}` : ""}
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
              <DataTable<JobOffer>
                tableId="job-offers-list"
                columns={columns}
                rows={items}
                rowId={(o) => o.id}
                isLoading={isLoading}
                selectedId={selectedId}
                onRowClick={(o) => setSelectedId(o.id)}
                emptyState={
                  <div className="py-10">
                    <FileSignature className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>No job offers match these filters.</p>
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
        preview={selectedId ? <OfferPreview id={selectedId} /> : null}
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
            <SheetTitle>New job offer</SheetTitle>
            <SheetDescription>
              Pick the applicant's job application to auto-fill the snapshot,
              then set offer date, terms and compensation.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            <JobOfferForm
              submitLabel="Save offer"
              submitting={creating}
              jobApplications={applications}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                try {
                  await createOffer(payload).unwrap();
                  toast({ title: "Job offer created" });
                  setCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: "Could not create offer",
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
            <SheetTitle>Edit job offer</SheetTitle>
            <SheetDescription>
              Update offer date, terms and compensation.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            {editId && (
              <EditOfferForm
                id={editId}
                jobApplications={applications}
                onDone={() => setEditId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function EditOfferForm({
  id,
  jobApplications,
  onDone,
}: {
  id: string;
  jobApplications: any[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetJobOfferQuery(id);
  const [updateOffer, { isLoading: saving }] = useUpdateJobOfferMutation();

  if (isLoading || !data?.offer) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <JobOfferForm
      initial={data.offer}
      submitLabel="Save changes"
      submitting={saving}
      jobApplications={jobApplications}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          await updateOffer({ id, body: payload }).unwrap();
          toast({ title: "Job offer updated" });
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
  const { data } = useGetJobOfferQuery(id);
  const [removeOffer, { isLoading: deleting }] = useDeleteJobOfferMutation();
  const o = data?.offer;
  if (!o) return <Skeleton className="h-5 w-40" />;

  const onDelete = async () => {
    if (
      !confirm(
        `Delete job offer for "${o.applicantName}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await removeOffer(o.id).unwrap();
      toast({ title: "Job offer deleted" });
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
      <span className="font-semibold truncate text-sm">{o.applicantName}</span>
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

function OfferPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetJobOfferQuery(id);
  const o = data?.offer;

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
      <div className="flex items-start gap-4">
        <div className="h-14 w-14 rounded-md flex items-center justify-center text-base font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0">
          {initialsOf(o.applicantName)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{o.applicantName}</h2>
          {o.applicantEmail && (
            <div className="text-sm text-muted-foreground mt-0.5 truncate inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {o.applicantEmail}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[o.status]} className="text-[10px]">
          {STATUS_LABEL[o.status]}
        </Badge>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(o.offerDate)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Offer ID" value={o.id} />
        {o.offerCode && <Fact label="Code" value={o.offerCode} />}
        {o.jobOfferTerm && <Fact label="Term" value={o.jobOfferTerm} />}
        {o.jobOpening && (
          <Fact
            icon={Briefcase}
            label="Job opening"
            value={
              o.jobOpening.profileName +
              (o.jobOpening.jobCode ? ` · ${o.jobOpening.jobCode}` : "")
            }
          />
        )}
        {o.staffingPlan && (
          <Fact
            icon={Layers}
            label="Staffing plan"
            value={
              o.staffingPlan.profileName +
              (o.staffingPlan.planCode ? ` · ${o.staffingPlan.planCode}` : "")
            }
          />
        )}
        {o.jobApplication && (
          <Fact
            label="Application"
            value={
              (o.jobApplication.applicationCode ||
                o.jobApplication.id.slice(0, 8)) +
              ` · ${o.jobApplication.applicantName}`
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

      {o.valueDescription && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Value / description
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {o.valueDescription}
          </p>
        </Card>
      )}

      {o.termsAndConditions && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Terms & conditions
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {o.termsAndConditions}
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
