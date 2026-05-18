"use client";

/**
 * Appointment Letters — recruitment workspace.
 *
 * Same workspace pattern as /job-offer: resizable list + preview, inline-edit
 * status, filter chips, saved views, in-page create Sheet.
 */

import { useMemo, useState } from "react";
import {
  useGetAppointmentLettersQuery,
  useGetAppointmentLetterQuery,
  useUpdateAppointmentLetterMutation,
  useCreateAppointmentLetterMutation,
  useDeleteAppointmentLetterMutation,
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
  Pencil,
  Trash2,
  Filter,
  Mail,
  Calendar,
  Briefcase,
  CheckCircle2,
  Building2,
  Printer,
  Download,
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

const FILTER_FIELDS: StaticFilterField<AppointmentLetter>[] = [
  {
    id: "applicantName",
    label: "Applicant Name",
    type: "text",
    accessor: (l) => l.applicantName,
  },
  {
    id: "applicantEmail",
    label: "Applicant Email",
    type: "text",
    accessor: (l) => l.applicantEmail,
  },
  {
    id: "company",
    label: "Company",
    type: "text",
    accessor: (l) => l.company,
  },
  {
    id: "letterCode",
    label: "Letter Code",
    type: "text",
    accessor: (l) => l.letterCode,
  },
  {
    id: "status",
    label: "Status",
    type: "select",
    accessor: (l) => l.status,
    options: (Object.entries(STATUS_LABEL) as [AppointmentLetterStatus, string][])
      .map(([value, label]) => ({ value, label })),
  },
  {
    id: "signed",
    label: "Signed",
    type: "boolean",
    accessor: (l) => !!l.signed,
  },
  {
    id: "appointmentDate",
    label: "Appointment Date",
    type: "date",
    accessor: (l) => l.appointmentDate,
  },
  {
    id: "signedDate",
    label: "Signed Date",
    type: "date",
    accessor: (l) => l.signedDate,
  },
  {
    id: "templateName",
    label: "Template",
    type: "text",
    accessor: (l) => l.templateName,
  },
  {
    id: "createdAt",
    label: "Created Date",
    type: "date",
    accessor: (l) => l.createdAt,
  },
];

// Browser-safe HTML escape — every interpolated field goes through this before
// hitting the printable document, so newlines stay (whitespace-pre-line) but
// any stray angle brackets in user content can't break the layout or inject
// markup.
function esc(s: string | null | undefined): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function paragraphsHtml(text: string | null | undefined): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return t
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function buildLetterHtml(l: AppointmentLetter): string {
  const title = l.title?.trim() || "Letter of Appointment";
  const company = l.company?.trim() || "";
  const issuedOn = formatDate(l.appointmentDate);
  const signedLine =
    l.signed && l.signedDate
      ? `<div class="sig-stamp">Accepted by candidate on ${esc(formatDate(l.signedDate))}</div>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} — ${esc(l.applicantName)}</title>
  <style>
    @page { size: A4; margin: 25mm 30mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: Georgia, "Times New Roman", serif;
      color: #111;
      font-size: 12pt;
      line-height: 1.55;
      background: #f3f4f6;
    }
    .sheet {
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      margin: 18px auto;
      padding: 25mm 30mm;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
    }
    @media print {
      body { background: #fff; }
      .sheet { box-shadow: none; margin: 0; width: auto; min-height: 0; padding: 0; }
      .toolbar { display: none !important; }
    }
    .toolbar {
      max-width: 210mm;
      margin: 16px auto 0;
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .toolbar button {
      cursor: pointer;
      border: 1px solid #d1d5db;
      background: #fff;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 13px;
    }
    .toolbar button.primary {
      background: #111827;
      color: #fff;
      border-color: #111827;
    }
    .letterhead {
      text-align: center;
      border-bottom: 2px solid #111;
      padding-bottom: 12px;
      margin-bottom: 28px;
    }
    .letterhead .company {
      font-size: 22pt;
      font-weight: 700;
      letter-spacing: 0.5px;
      margin: 0;
    }
    .meta {
      display: flex;
      justify-content: space-between;
      font-size: 11pt;
      margin-bottom: 28px;
    }
    .meta .ref { color: #555; }
    .recipient { margin-bottom: 22px; }
    .recipient .label { color: #555; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 4px; }
    .subject {
      text-align: center;
      font-weight: 700;
      text-decoration: underline;
      margin: 14px 0 22px;
      font-size: 14pt;
    }
    .salutation { margin-bottom: 14px; }
    .body p { margin: 0 0 12px; text-align: justify; }
    .closing { margin-top: 32px; }
    .signature-block {
      margin-top: 56px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
    }
    .sig-col { width: 45%; }
    .sig-line {
      border-top: 1px solid #111;
      padding-top: 4px;
      font-size: 10pt;
      color: #444;
    }
    .sig-stamp {
      margin-top: 12px;
      display: inline-block;
      border: 1px dashed #16a34a;
      color: #15803d;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 10pt;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()" class="primary">Save as PDF / Print</button>
    <button onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <div class="letterhead">
      <p class="company">${esc(company) || "Company Name"}</p>
    </div>

    <div class="meta">
      <div class="ref">${l.letterCode ? `Ref: ${esc(l.letterCode)}` : ""}</div>
      <div>Date: ${esc(issuedOn)}</div>
    </div>

    <div class="recipient">
      <div class="label">To,</div>
      <div><strong>${esc(l.applicantName)}</strong></div>
      ${l.applicantEmail ? `<div>${esc(l.applicantEmail)}</div>` : ""}
    </div>

    <div class="subject">${esc(title)}</div>

    <div class="salutation">Dear ${esc(l.applicantName.split(/\s+/)[0] || l.applicantName)},</div>

    <div class="body">
      ${paragraphsHtml(l.introduction)}
      ${paragraphsHtml(l.description)}
      ${paragraphsHtml(l.closingNotes)}
    </div>

    <div class="closing">Sincerely,</div>

    <div class="signature-block">
      <div class="sig-col">
        <div class="sig-line">For ${esc(company) || "the Company"}<br />Authorised Signatory</div>
      </div>
      <div class="sig-col" style="text-align:right">
        <div class="sig-line">${esc(l.applicantName)}<br />(Candidate Signature)</div>
        ${signedLine}
      </div>
    </div>
  </div>
</body>
</html>`;
}

// Open the formatted letter in a new tab via a blob URL + anchor click. We
// don't use window.open() because aggressive pop-up blockers reject it even
// inside a click handler; programmatic anchor clicks aren't blocked because
// the browser treats them as user-initiated navigation.
function viewLetterDocument(l: AppointmentLetter) {
  const html = buildLetterHtml(l);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener,noreferrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the new tab a moment to load before we revoke; revoking too early
  // would 404 the page in the new tab on slower machines.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// Print via an off-screen iframe — sidesteps pop-up blockers entirely. The
// browser print dialog includes "Save as PDF" as a destination, so this also
// serves as the PDF download path.
function printLetterDocument(l: AppointmentLetter) {
  const html = buildLetterHtml(l);
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const cleanup = () => {
    // Defer so the browser keeps the document alive long enough for the
    // print dialog to finish reading it.
    setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* noop */
      }
    }, 1000);
  };

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.error("[appointment-letter] print failed", err);
    } finally {
      // Some browsers fire afterprint inside the iframe — we just clean up
      // unconditionally after a short delay either way.
      cleanup();
    }
  };

  // Using srcdoc instead of document.write keeps the same-origin context
  // and avoids edge-cases where contentDocument.write isn't ready yet.
  iframe.srcdoc = html;
}

export default function AppointmentLetterListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [fieldFilters, setFieldFilters] = useState<FieldFilter[]>([]);
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
    const base = allLetters.filter((l) => {
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
    return applyStaticFilters(base, FILTER_FIELDS, fieldFilters);
  }, [allLetters, filters, fieldFilters]);

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
                const res = await updateLetter({
                  id: l.id,
                  body: { status: next },
                }).unwrap();
                if (res?.autoCreatedEmployee) {
                  toast({
                    title: res.autoCreatedEmployee.alreadyExisted
                      ? "Employee already in Employee Master"
                      : "Employee added to Employee Master",
                    description:
                      "Onboarded automatically from the signed letter.",
                  });
                } else if (res?.autoCreateEmployeeError) {
                  toast({
                    title: "Letter saved, but employee onboarding failed",
                    description: res.autoCreateEmployeeError,
                    variant: "destructive",
                  });
                }
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
                  const res = await createLetter(payload).unwrap();
                  toast({ title: "Appointment letter created" });
                  if (res?.autoCreatedEmployee) {
                    toast({
                      title: res.autoCreatedEmployee.alreadyExisted
                        ? "Employee already in Employee Master"
                        : "Employee added to Employee Master",
                      description:
                        "Onboarded automatically from the signed letter.",
                    });
                  } else if (res?.autoCreateEmployeeError) {
                    toast({
                      title: "Letter saved, but employee onboarding failed",
                      description: res.autoCreateEmployeeError,
                      variant: "destructive",
                    });
                  }
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

      <Sheet open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl overflow-y-auto p-0"
        >
          <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
            <SheetTitle>Edit appointment letter</SheetTitle>
            <SheetDescription>
              Update letter body, appointment date and signing status.
            </SheetDescription>
          </SheetHeader>
          <div className="px-5 sm:px-6 py-5">
            {editId && (
              <EditLetterForm
                id={editId}
                jobOffers={offers}
                jobApplications={applications}
                onDone={() => setEditId(null)}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <StaticFilterSidebar<AppointmentLetter>
        open={filterOpen}
        onOpenChange={setFilterOpen}
        fields={FILTER_FIELDS}
        filters={fieldFilters}
        onFiltersChange={setFieldFilters}
        records={allLetters}
      />
    </>
  );
}

function EditLetterForm({
  id,
  jobOffers,
  jobApplications,
  onDone,
}: {
  id: string;
  jobOffers: any[];
  jobApplications: any[];
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetAppointmentLetterQuery(id);
  const [updateLetter, { isLoading: saving }] =
    useUpdateAppointmentLetterMutation();

  if (isLoading || !data?.letter) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <AppointmentLetterForm
      initial={data.letter}
      submitLabel="Save changes"
      submitting={saving}
      jobOffers={jobOffers}
      jobApplications={jobApplications}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          const res = await updateLetter({ id, body: payload }).unwrap();
          toast({ title: "Appointment letter updated" });
          if (res?.autoCreatedEmployee) {
            toast({
              title: res.autoCreatedEmployee.alreadyExisted
                ? "Employee already in Employee Master"
                : "Employee added to Employee Master",
              description:
                "Onboarded automatically from the signed letter.",
            });
          } else if (res?.autoCreateEmployeeError) {
            toast({
              title: "Letter saved, but employee onboarding failed",
              description: res.autoCreateEmployeeError,
              variant: "destructive",
            });
          }
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
  const { data } = useGetAppointmentLetterQuery(id);
  const [removeLetter, { isLoading: deleting }] =
    useDeleteAppointmentLetterMutation();
  const l = data?.letter;
  if (!l) return <Skeleton className="h-5 w-40" />;

  const onDelete = async () => {
    if (
      !confirm(
        `Delete appointment letter for "${l.applicantName}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await removeLetter(l.id).unwrap();
      toast({ title: "Appointment letter deleted" });
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
        <div className="ml-auto flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            onClick={() => viewLetterDocument(l)}
          >
            <Printer className="h-3.5 w-3.5" />
            View Letter
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => printLetterDocument(l)}
          >
            <Download className="h-3.5 w-3.5" />
            Download PDF
          </Button>
        </div>
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
