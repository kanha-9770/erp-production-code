"use client";

/**
 * Appointment Letters — recruitment workspace.
 *
 * Same workspace pattern as /job-offer: resizable list + preview, inline-edit
 * status, filter chips, saved views, in-page create Sheet.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetAppointmentLettersQuery,
  useGetAppointmentLetterQuery,
  useUpdateAppointmentLetterMutation,
  useCreateAppointmentLetterMutation,
  type AppointmentLetter,
  type AppointmentLetterStatus,
} from "@/lib/api/appointment-letters";
import { useGetJobOffersQuery } from "@/lib/api/job-offers";
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
  ScrollText,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Mail,
  Calendar,
  Briefcase,
  CheckCircle2,
  Building2,
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
import { AppointmentLetterForm } from "@/components/appointment-letter/appointment-letter-form";
import { STATUS_OPTIONS as FORM_STATUS_OPTIONS } from "@/components/appointment-letter/appointment-letter-form";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<AppointmentLetterStatus, string> = {
  DRAFT: "Draft",
  ISSUED: "Issued",
  SIGNED: "Signed",
  REVOKED: "Revoked",
};

const STATUS_VARIANT: Record<
  AppointmentLetterStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  DRAFT: "secondary",
  ISSUED: "default",
  SIGNED: "default",
  REVOKED: "destructive",
};

const STATUS_TINT: Record<AppointmentLetterStatus, string> = {
  DRAFT: "#9ca3af",
  ISSUED: "#3b82f6",
  SIGNED: "#22c55e",
  REVOKED: "#ef4444",
};

interface Filters {
  search: string;
  status: string;
  signed: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  signed: "",
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

export default function AppointmentLetterListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createLetter, { isLoading: creating }] =
    useCreateAppointmentLetterMutation();

  const views = useSavedViews<Filters>("appointment-letters");

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

  const { data, isLoading, isFetching } = useGetAppointmentLettersQuery();
  const allLetters = useMemo(() => data?.letters ?? [], [data?.letters]);

  // Pre-load offers + applications so the create-sheet pickers are instant.
  const { data: offersData } = useGetJobOffersQuery();
  const offers = useMemo(() => offersData?.offers ?? [], [offersData]);
  const { data: appsData } = useGetJobApplicationsQuery();
  const applications = useMemo(
    () => appsData?.applications ?? [],
    [appsData],
  );

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allLetters.filter((l) => {
      if (filters.status && l.status !== filters.status) return false;
      if (filters.signed === "yes" && !l.signed) return false;
      if (filters.signed === "no" && l.signed) return false;
      if (!q) return true;
      return (
        l.applicantName?.toLowerCase().includes(q) ||
        (l.applicantEmail ?? "").toLowerCase().includes(q) ||
        (l.company ?? "").toLowerCase().includes(q) ||
        (l.title ?? "").toLowerCase().includes(q) ||
        (l.letterCode ?? "").toLowerCase().includes(q) ||
        l.id?.toLowerCase().includes(q)
      );
    });
  }, [allLetters, filters]);

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
              {STATUS_LABEL[filters.status as AppointmentLetterStatus]}
            </strong>
          </>
        ),
      });
    if (filters.signed)
      pills.push({
        key: "signed",
        label: (
          <>
            Signature:{" "}
            <strong>{filters.signed === "yes" ? "signed" : "unsigned"}</strong>
          </>
        ),
      });
    return pills;
  }, [filters]);

  const [updateLetter] = useUpdateAppointmentLetterMutation();

  const columns: ColumnDef<AppointmentLetter>[] = useMemo(
    () => [
      {
        id: "avatar",
        header: "",
        width: 56,
        pinned: true,
        copyValue: () => "",
        cell: (l) => (
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-[11px] font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0"
            aria-hidden
          >
            {initialsOf(l.applicantName)}
          </div>
        ),
      },
      {
        id: "applicant",
        header: "Applicant",
        width: 220,
        pinned: true,
        sortKey: "applicantName",
        copyValue: (l) => l.applicantName,
        cell: (l) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{l.applicantName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {l.applicantEmail ?? "—"}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        sortKey: "status",
        copyValue: (l) => STATUS_LABEL[l.status],
        cell: (l) => (
          <InlineEditCell<AppointmentLetterStatus>
            mode="select"
            value={l.status}
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
                await updateLetter({
                  id: l.id,
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
        id: "company",
        header: "Company",
        width: 160,
        sortKey: "company",
        copyValue: (l) => l.company ?? "",
        cell: (l) => (
          <span className="truncate text-sm">{l.company ?? "—"}</span>
        ),
      },
      {
        id: "appointmentDate",
        header: "Appointment",
        width: 130,
        sortKey: "appointmentDate",
        copyValue: (l) => formatDate(l.appointmentDate),
        cell: (l) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(l.appointmentDate)}
          </span>
        ),
      },
      {
        id: "signed",
        header: "Signed",
        width: 90,
        sortKey: "signed",
        copyValue: (l) => (l.signed ? "yes" : "no"),
        cell: (l) =>
          l.signed ? (
            <Badge
              variant="outline"
              className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Signed
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">—</span>
          ),
      },
      {
        id: "signedDate",
        header: "Signed on",
        width: 120,
        defaultHidden: true,
        copyValue: (l) => formatDate(l.signedDate),
        cell: (l) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(l.signedDate)}
          </span>
        ),
      },
      {
        id: "template",
        header: "Template",
        width: 160,
        defaultHidden: true,
        copyValue: (l) => l.templateName ?? "",
        cell: (l) => (
          <span className="truncate text-xs text-muted-foreground">
            {l.templateName ?? "—"}
          </span>
        ),
      },
      {
        id: "title",
        header: "Title",
        width: 200,
        defaultHidden: true,
        copyValue: (l) => l.title ?? "",
        cell: (l) => (
          <span className="truncate text-sm">{l.title ?? "—"}</span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 110,
        defaultHidden: true,
        sortKey: "createdAt",
        copyValue: (l) => formatDate(l.createdAt),
        cell: (l) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(l.createdAt)}
          </span>
        ),
      },
    ],
    [updateLetter, toast],
  );

  return (
    <>
      <WorkspaceShell
        scope="appointment-letters"
        selectedId={selectedId}
        onCloseSelection={() => setSelectedId(null)}
        header={
          <>
            <WorkspaceHeader
              icon={<ScrollText className="h-4 w-4" />}
              title="Appointment Letter"
              subtitle={`${total.toLocaleString()} letter${
                total === 1 ? "" : "s"
              }${isFetching ? " · syncing…" : ""}`}
            >
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search applicant, company, title…"
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
                <Plus className="h-3.5 w-3.5 mr-1" /> New letter
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
                label="Signature"
                value={filters.signed}
                onChange={(v) => updateFilter("signed", v)}
                options={[
                  { value: "yes", label: "Signed" },
                  { value: "no", label: "Unsigned" },
                ]}
              />
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
              <DataTable<AppointmentLetter>
                tableId="appointment-letters-list"
                columns={columns}
                rows={items}
                rowId={(l) => l.id}
                isLoading={isLoading}
                selectedId={selectedId}
                onRowClick={(l) => setSelectedId(l.id)}
                emptyState={
                  <div className="py-10">
                    <ScrollText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                    <p>No appointment letters match these filters.</p>
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
        preview={selectedId ? <LetterPreview id={selectedId} /> : null}
        previewHeader={selectedId ? <PreviewHeader id={selectedId} /> : null}
      />

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-0"
        >
          <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>New appointment letter</SheetTitle>
            <SheetDescription>
              Pick the accepted job offer to auto-fill the applicant snapshot,
              then capture the letter body and appointment date.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            <AppointmentLetterForm
              submitLabel="Save letter"
              submitting={creating}
              jobOffers={offers}
              jobApplications={applications}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                try {
                  await createLetter(payload).unwrap();
                  toast({ title: "Appointment letter created" });
                  setCreateOpen(false);
                } catch (e: any) {
                  toast({
                    title: "Could not create letter",
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
    </>
  );
}

function PreviewHeader({ id }: { id: string }) {
  const { data } = useGetAppointmentLetterQuery(id);
  const l = data?.letter;
  if (!l) return <Skeleton className="h-5 w-40" />;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={STATUS_VARIANT[l.status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[l.status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{l.applicantName}</span>
      {l.signed && (
        <Badge
          variant="outline"
          className="text-[10px] border-emerald-500/40 text-emerald-700 dark:text-emerald-400 shrink-0"
        >
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Signed
        </Badge>
      )}
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/appointment-letter/${l.id}`} title="Open full page">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Link href={`/appointment-letter/${l.id}/edit`} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function LetterPreview({ id }: { id: string }) {
  const { data, isLoading } = useGetAppointmentLetterQuery(id);
  const l = data?.letter;

  if (isLoading || !l) {
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
          {initialsOf(l.applicantName)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">
            {l.title || l.applicantName}
          </h2>
          {l.applicantEmail && (
            <div className="text-sm text-muted-foreground mt-0.5 truncate inline-flex items-center gap-1">
              <Mail className="h-3.5 w-3.5" />
              {l.applicantEmail}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANT[l.status]} className="text-[10px]">
          {STATUS_LABEL[l.status]}
        </Badge>
        <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          {formatDate(l.appointmentDate)}
        </span>
        {l.signed && (
          <span className="text-xs text-emerald-700 dark:text-emerald-400 inline-flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            Signed {formatDate(l.signedDate)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Letter ID" value={l.id} />
        {l.letterCode && <Fact label="Code" value={l.letterCode} />}
        <Fact icon={Building2} label="Company" value={l.company ?? "—"} />
        {l.templateName && (
          <Fact label="Template" value={l.templateName} />
        )}
        {l.jobOffer && (
          <Fact
            icon={Briefcase}
            label="Job offer"
            value={
              (l.jobOffer.offerCode || l.jobOffer.id.slice(0, 8)) +
              ` · ${l.jobOffer.status}`
            }
          />
        )}
        {l.jobApplication && (
          <Fact
            label="Application"
            value={
              (l.jobApplication.applicationCode ||
                l.jobApplication.id.slice(0, 8)) +
              ` · ${l.jobApplication.applicantName}`
            }
          />
        )}
        {l.createdBy && (
          <Fact
            label="Created by"
            value={
              `${l.createdBy.first_name ?? ""} ${l.createdBy.last_name ?? ""}`.trim() ||
              l.createdBy.email
            }
          />
        )}
      </div>

      {l.introduction && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Introduction
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {l.introduction}
          </p>
        </Card>
      )}

      {l.description && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Description
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {l.description}
          </p>
        </Card>
      )}

      {l.closingNotes && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            Closing notes
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-line">
            {l.closingNotes}
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
