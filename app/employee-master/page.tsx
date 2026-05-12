"use client";

/**
 * Employee Master — modern workspace.
 *
 * Layout: resizable list-and-preview shell. Click a row → preview slides in.
 * Persists pane sizes, column visibility/sort, and saved filter views per
 * user.
 *
 * Inline-edit: only `status` is editable from the list. For full edits use
 * the "Open" button in the preview header.
 *
 * Backed by /api/employees (GET/POST) and /api/employees/[id] (GET/PUT/DELETE),
 * which return the entire org's employee list — filtering and pagination are
 * applied client-side.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useGetEmployeeListQuery,
  useGetEmployeeQuery,
  useUpdateEmployeeMutation,
  useCreateEmployeeMutation,
  type EmployeeListItem,
  type EmployeeStatus,
} from "@/lib/api/employees";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { EmployeeForm } from "@/components/employee/employee-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Users,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Pencil,
  Mail,
  Phone,
  Calendar,
  Briefcase,
  IndianRupee,
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

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  ON_LEAVE: "On leave",
  TERMINATED: "Terminated",
};

const STATUS_VARIANT: Record<EmployeeStatus, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  ON_LEAVE: "outline",
  TERMINATED: "destructive",
};

const STATUS_OPTIONS: Array<{ value: EmployeeStatus; label: string; tint: string }> = [
  { value: "ACTIVE", label: "Active", tint: "#22c55e" },
  { value: "ON_LEAVE", label: "On leave", tint: "#f59e0b" },
  { value: "INACTIVE", label: "Inactive", tint: "#9ca3af" },
  { value: "TERMINATED", label: "Terminated", tint: "#ef4444" },
];

interface Filters {
  search: string;
  status: string;
  department: string;
  gender: string;
}

const EMPTY_FILTERS: Filters = {
  search: "",
  status: "",
  department: "",
  gender: "",
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

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default function EmployeeMasterListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmployee, { isLoading: creating }] = useCreateEmployeeMutation();

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
  const allEmployees = useMemo(() => data?.employees ?? [], [data?.employees]);

  const departmentOptions = useMemo(() => {
    const set = new Set<string>();
    allEmployees.forEach((e) => {
      const d = (e.department ?? "").trim();
      if (d) set.add(d);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allEmployees]);

  const filtered = useMemo(() => {
    const q = filters.search.trim().toLowerCase();
    return allEmployees.filter((e) => {
      if (
        filters.status &&
        (e.status ?? "").toString().toUpperCase() !== filters.status
      )
        return false;
      if (filters.department && (e.department ?? "") !== filters.department)
        return false;
      if (filters.gender && (e.gender ?? "") !== filters.gender) return false;
      if (!q) return true;
      return (
        e.employeeName?.toLowerCase().includes(q) ||
        (e.designation ?? "").toLowerCase().includes(q) ||
        (e.department ?? "").toLowerCase().includes(q) ||
        (e.emailAddress1 ?? "").toLowerCase().includes(q) ||
        (e.personalContact ?? "").toLowerCase().includes(q) ||
        e.id?.toLowerCase().includes(q)
      );
    });
  }, [allEmployees, filters]);

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
            Status: <strong>{STATUS_LABEL[filters.status as EmployeeStatus]}</strong>
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
    if (filters.gender)
      pills.push({
        key: "gender",
        label: (
          <>
            Gender: <strong>{filters.gender}</strong>
          </>
        ),
      });
    return pills;
  }, [filters]);

  const [updateEmployee] = useUpdateEmployeeMutation();

  const columns: ColumnDef<EmployeeListItem>[] = useMemo(
    () => [
      {
        id: "avatar",
        header: "",
        width: 56,
        pinned: true,
        copyValue: () => "",
        cell: (e) => (
          <div
            className="h-8 w-8 rounded-md flex items-center justify-center text-[11px] font-semibold text-primary-foreground bg-primary/90 ring-1 ring-black/5 shrink-0"
            aria-hidden
          >
            {initialsOf(e.employeeName)}
          </div>
        ),
      },
      {
        id: "name",
        header: "Employee",
        width: 260,
        pinned: true,
        sortKey: "employeeName",
        copyValue: (e) => e.employeeName,
        cell: (e) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{e.employeeName}</div>
            <div className="text-[11px] text-muted-foreground truncate">
              {e.designation ?? "—"}
              {e.emailAddress1 ? ` · ${e.emailAddress1}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 140,
        sortKey: "status",
        copyValue: (e) =>
          e.status ? STATUS_LABEL[e.status as EmployeeStatus] : "—",
        cell: (e) => (
          <InlineEditCell<EmployeeStatus>
            mode="select"
            value={(e.status ?? "ACTIVE") as EmployeeStatus}
            stopRowClick
            options={STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            render={(v) => (
              <Badge variant={STATUS_VARIANT[v]} className="text-[10px]">
                {STATUS_LABEL[v]}
              </Badge>
            )}
            onSave={async (next) => {
              try {
                await updateEmployee({ id: e.id, body: { status: next } }).unwrap();
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
        width: 160,
        sortKey: "department",
        copyValue: (e) => e.department ?? "",
        cell: (e) => (
          <span className="truncate text-sm">{e.department ?? "—"}</span>
        ),
      },
      {
        id: "designation",
        header: "Designation",
        width: 180,
        defaultHidden: true,
        copyValue: (e) => e.designation ?? "",
        cell: (e) => (
          <span className="truncate text-sm">{e.designation ?? "—"}</span>
        ),
      },
      {
        id: "company",
        header: "Company",
        width: 160,
        defaultHidden: true,
        copyValue: (e) => e.companyName ?? "",
        cell: (e) => (
          <span className="truncate text-sm">{e.companyName ?? "—"}</span>
        ),
      },
      {
        id: "ctc",
        header: "CTC",
        width: 130,
        align: "right",
        sortKey: "totalSalary",
        copyValue: (e) => String(toNum(e.totalSalary)),
        cell: (e) => (
          <span className="font-semibold tabular-nums">
            ₹{formatINR(toNum(e.totalSalary))}
          </span>
        ),
      },
      {
        id: "takeHome",
        header: "Take-home",
        width: 130,
        align: "right",
        defaultHidden: true,
        copyValue: (e) => String(toNum(e.givenSalary)),
        cell: (e) => (
          <span className="tabular-nums text-muted-foreground">
            ₹{formatINR(toNum(e.givenSalary))}
          </span>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        width: 140,
        defaultHidden: true,
        copyValue: (e) => e.personalContact ?? "",
        cell: (e) => (
          <span className="text-sm tabular-nums truncate">
            {e.personalContact ?? "—"}
          </span>
        ),
      },
      {
        id: "joined",
        header: "Joined",
        width: 110,
        sortKey: "dateOfJoining",
        copyValue: (e) => formatDate(e.dateOfJoining),
        cell: (e) => (
          <span className="text-xs text-muted-foreground">
            {formatDate(e.dateOfJoining)}
          </span>
        ),
      },
      {
        id: "shift",
        header: "Shift",
        width: 110,
        defaultHidden: true,
        copyValue: (e) => e.shiftType ?? "",
        cell: (e) => (
          <span className="text-xs text-muted-foreground">{e.shiftType ?? "—"}</span>
        ),
      },
    ],
    [updateEmployee, toast],
  );

  return (
    <>
    <WorkspaceShell
      scope="employees"
      selectedId={selectedId}
      onCloseSelection={() => setSelectedId(null)}
      header={
        <>
          <WorkspaceHeader
            icon={<Users className="h-4 w-4" />}
            title="Employee Master"
            subtitle={`${total.toLocaleString()} employee${total === 1 ? "" : "s"}${
              isFetching ? " · syncing…" : ""
            }`}
          >
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search name, designation, email…"
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
              label="Gender"
              value={filters.gender}
              onChange={(v) => updateFilter("gender", v)}
              options={[
                { value: "MALE", label: "Male" },
                { value: "FEMALE", label: "Female" },
                { value: "OTHER", label: "Other" },
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
            <DataTable<EmployeeListItem>
              tableId="emp-master-list"
              columns={columns}
              rows={items}
              rowId={(e) => e.id}
              isLoading={isLoading}
              selectedId={selectedId}
              onRowClick={(e) => setSelectedId(e.id)}
              emptyState={
                <div className="py-10">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p>No employees match these filters.</p>
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
      preview={selectedId ? <EmployeePreview id={selectedId} /> : null}
      previewHeader={selectedId ? <PreviewHeader id={selectedId} /> : null}
    />

    <Sheet open={createOpen} onOpenChange={setCreateOpen}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle>New employee</SheetTitle>
          <SheetDescription>
            Capture the basics now — bank, IDs and shift details can be filled
            in later from the employee profile.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 sm:px-6 py-5">
          <EmployeeForm
            submitLabel="Create employee"
            submitting={creating}
            onCancel={() => setCreateOpen(false)}
            onSubmit={async (payload) => {
              try {
                await createEmployee(payload).unwrap();
                toast({ title: "Employee created" });
                setCreateOpen(false);
              } catch (e: any) {
                toast({
                  title: "Could not create employee",
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
  const { data } = useGetEmployeeQuery(id);
  const e = data?.employee;
  if (!e) return <Skeleton className="h-5 w-40" />;
  const status = (e.status ?? "ACTIVE") as EmployeeStatus;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={STATUS_VARIANT[status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{e.employeeName}</span>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-auto">
        <Link href={`/employee-master/${e.id}`} title="Open full page">
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" className="h-7 w-7 shrink-0">
        <Link href={`/employee-master/${e.id}/edit`} title="Edit">
          <Pencil className="h-3.5 w-3.5" />
        </Link>
      </Button>
    </div>
  );
}

function EmployeePreview({ id }: { id: string }) {
  const { data, isLoading } = useGetEmployeeQuery(id);
  const e = data?.employee;

  if (isLoading || !e) {
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
          {initialsOf(e.employeeName)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold truncate">{e.employeeName}</h2>
          <div className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
            <Briefcase className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {e.designation ?? "—"} · {e.department ?? "Unassigned"}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
            {e.emailAddress1 && (
              <span className="inline-flex items-center gap-1 truncate">
                <Mail className="h-3 w-3" /> {e.emailAddress1}
              </span>
            )}
            {e.personalContact && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {e.personalContact}
              </span>
            )}
          </div>
        </div>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
          Total CTC
        </div>
        <div className="text-3xl font-bold tabular-nums">
          ₹{formatINR(toNum(e.totalSalary))}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Take-home ₹{formatINR(toNum(e.givenSalary))} ·{" "}
          {e.dateOfJoining ? `joined ${formatDate(e.dateOfJoining)}` : "no joining date"}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Employee ID" value={e.id} />
        <Fact label="Gender" value={e.gender ?? "—"} />
        <Fact label="DOB" icon={Calendar} value={formatDate(e.dob)} />
        <Fact label="Joined" icon={Calendar} value={formatDate(e.dateOfJoining)} />
        <Fact label="Date of leaving" icon={Calendar} value={formatDate(e.dateOfLeaving)} />
        <Fact label="Native place" value={e.nativePlace ?? "—"} />
        <Fact label="Country" value={e.country ?? "—"} />
        <Fact label="Company" icon={Building2} value={e.companyName ?? "—"} />
        <Fact label="Engagement team" value={e.employeeEngagementTeamName ?? "—"} />
        <Fact label="Shift" value={e.shiftType ?? "—"} />
        {(e.inTime || e.outTime) && (
          <Fact
            label="Shift hours"
            value={`${e.inTime ?? "—"} → ${e.outTime ?? "—"}`}
          />
        )}
      </div>

      <Card className="p-4">
        <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Compensation
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Fact
            icon={IndianRupee}
            label="Total salary"
            value={`₹${formatINR(toNum(e.totalSalary))}`}
          />
          <Fact
            icon={IndianRupee}
            label="Take-home"
            value={`₹${formatINR(toNum(e.givenSalary))}`}
          />
          <Fact label="Bonus" value={`₹${formatINR(toNum(e.bonusAmount))}`} />
          <Fact
            label="Night allowance"
            value={`₹${formatINR(toNum(e.nightAllowance))}`}
          />
          <Fact label="Overtime" value={`₹${formatINR(toNum(e.overTime))}`} />
          <Fact
            label="One-hour extra"
            value={`₹${formatINR(toNum(e.oneHourExtra))}`}
          />
          {e.incrementMonth != null && (
            <Fact label="Increment month" value={String(e.incrementMonth)} />
          )}
          {e.yearsOfAgreement != null && (
            <Fact label="Years of agreement" value={String(e.yearsOfAgreement)} />
          )}
        </div>
      </Card>

      {(e.bankName || e.bankAccountNo || e.ifscCode || e.aadharCardNo) && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Bank & identification
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Fact label="Bank" value={e.bankName ?? "—"} />
            <Fact label="Account no" value={e.bankAccountNo ?? "—"} />
            <Fact label="IFSC" value={e.ifscCode ?? "—"} />
            <Fact label="Aadhaar" value={e.aadharCardNo ?? "—"} />
          </div>
        </Card>
      )}

      {(e.permanentAddress || e.currentAddress) && (
        <Card className="p-4">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Addresses
          </div>
          <div className="space-y-2 text-sm">
            {e.permanentAddress && (
              <div>
                <div className="text-[11px] text-muted-foreground">Permanent</div>
                <p className="leading-relaxed whitespace-pre-line">
                  {e.permanentAddress}
                </p>
              </div>
            )}
            {e.currentAddress && (
              <div>
                <div className="text-[11px] text-muted-foreground">Current</div>
                <p className="leading-relaxed whitespace-pre-line">
                  {e.currentAddress}
                </p>
              </div>
            )}
          </div>
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
