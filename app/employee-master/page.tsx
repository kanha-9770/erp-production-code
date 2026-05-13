"use client";

/**
 * Employee Master — spreadsheet-style records page.
 *
 * Full-page table with section-grouped columns and a toolbar carrying the
 * standard Filter / Sort / Saved-views / Search / Print / Import / Export /
 * per-page / Column-options actions. Built on `EmployeeMasterTable` so the
 * static page mirrors the look of the dynamic form-builder records view.
 *
 * Backed by /api/employees (GET/POST) and /api/employees/[id] (GET/PUT/DELETE).
 */

<<<<<<< HEAD
import { useMemo, useState } from "react";
=======
import { useState } from "react";
>>>>>>> f4dc3c5d72d52d953b0dcb8bdae8aa7e4df6523e
import {
  useGetEmployeeListQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
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
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
<<<<<<< HEAD
import { Card } from "@/components/ui/card";
import {
  Users,
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
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
=======
import { Plus, Users } from "lucide-react";
>>>>>>> f4dc3c5d72d52d953b0dcb8bdae8aa7e4df6523e
import { useToast } from "@/hooks/use-toast";
import {
  EmployeeMasterTable,
  type EMColumn,
} from "@/components/employee/employee-master-table";

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

function splitName(full: string | null | undefined): { first: string; last: string } {
  if (!full) return { first: "", last: "" };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function formatDate(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toNum(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const COLUMNS: EMColumn<EmployeeListItem>[] = [
  // ── Personal Information ──────────────────────────────────────────────────
  {
    id: "salutation",
    label: "Salutation",
    section: "Personal Information",
    kind: "link",
    value: () => null,
  },
  {
    id: "firstName",
    label: "First Name",
    section: "Personal Information",
    kind: "text",
    value: (e) => splitName(e.employeeName).first,
    cell: (e) => <span className="font-medium">{splitName(e.employeeName).first.toUpperCase() || "N/A"}</span>,
  },
  {
    id: "lastName",
    label: "Last Name",
    section: "Personal Information",
    kind: "text",
    value: (e) => splitName(e.employeeName).last,
    cell: (e) => {
      const last = splitName(e.employeeName).last;
      return last ? <span>{last.toUpperCase()}</span> : <span className="text-muted-foreground">N/A</span>;
    },
  },
  {
    id: "gender",
    label: "Gender",
    section: "Personal Information",
    kind: "status",
    value: (e) => e.gender,
    defaultHidden: true,
  },

  // ── Contact Information ───────────────────────────────────────────────────
  {
    id: "personalEmail",
    label: "Personal Email",
    section: "Contact Information",
    kind: "email",
    value: (e) => e.emailAddress1,
  },
  {
    id: "companyEmail",
    label: "Company Email",
    section: "Contact Information",
    kind: "email",
    value: () => null,
  },
  {
    id: "personalContact",
    label: "Phone",
    section: "Contact Information",
    kind: "phone",
    value: (e) => e.personalContact,
  },

  // ── Employment ────────────────────────────────────────────────────────────
  {
    id: "designation",
    label: "Designation",
    section: "Employment",
    kind: "text",
    value: (e) => e.designation,
  },
  {
    id: "department",
    label: "Department",
    section: "Employment",
    kind: "text",
    value: (e) => e.department,
  },
  {
    id: "company",
    label: "Company",
    section: "Employment",
    kind: "text",
    value: (e) => e.companyName,
    defaultHidden: true,
  },
  {
    id: "engagementTeam",
    label: "Engagement Team",
    section: "Employment",
    kind: "text",
    value: (e) => e.employeeEngagementTeamName,
    defaultHidden: true,
  },
  {
    id: "shift",
    label: "Shift",
    section: "Employment",
    kind: "text",
    value: (e) => e.shiftType,
    defaultHidden: true,
  },
  {
    id: "dateOfJoining",
    label: "Date of Joining",
    section: "Employment",
    kind: "date",
    value: (e) => e.dateOfJoining,
    cell: (e) => (
      <span className="text-xs">{formatDate(e.dateOfJoining) || <span className="text-muted-foreground">N/A</span>}</span>
    ),
  },
  {
    id: "dateOfLeaving",
    label: "Date of Leaving",
    section: "Employment",
    kind: "date",
    value: (e) => e.dateOfLeaving,
    defaultHidden: true,
    cell: (e) => (
      <span className="text-xs">{formatDate(e.dateOfLeaving) || <span className="text-muted-foreground">N/A</span>}</span>
    ),
  },
  {
    id: "status",
    label: "Status",
    section: "Employment",
    kind: "status",
    value: (e) => e.status,
    cell: (e) => {
      const s = (e.status ?? "ACTIVE") as EmployeeStatus;
      return (
        <Badge variant={STATUS_VARIANT[s]} className="text-[10px]">
          {STATUS_LABEL[s]}
        </Badge>
      );
    },
  },

  // ── Compensation ──────────────────────────────────────────────────────────
  {
    id: "totalSalary",
    label: "Total Salary",
    section: "Compensation",
    kind: "currency",
    value: (e) => toNum(e.totalSalary),
  },
  {
    id: "givenSalary",
    label: "Take-home",
    section: "Compensation",
    kind: "currency",
    value: (e) => toNum(e.givenSalary),
    defaultHidden: true,
  },
  {
    id: "bonusAmount",
    label: "Bonus",
    section: "Compensation",
    kind: "currency",
    value: (e) => toNum(e.bonusAmount),
    defaultHidden: true,
  },
];

export default function EmployeeMasterListPage() {
  const { toast } = useToast();
<<<<<<< HEAD
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
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

=======
>>>>>>> f4dc3c5d72d52d953b0dcb8bdae8aa7e4df6523e
  const { data, isLoading, isFetching } = useGetEmployeeListQuery();
  const employees = data?.employees ?? [];

  const [createOpen, setCreateOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [createEmployee, { isLoading: creating }] = useCreateEmployeeMutation();
  const [deleteEmployee] = useDeleteEmployeeMutation();

  const handleDelete = async (e: EmployeeListItem) => {
    if (!confirm(`Delete employee "${e.employeeName}"? This cannot be undone.`)) return;
    try {
      await deleteEmployee(e.id).unwrap();
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
    <div className="flex flex-col h-screen">
      {/* Page header — title on the left, primary action on the right. The
          "New employee" button lives here (not in the records toolbar) so the
          toolbar stays single-row for Filter / Sort / Saved / Search / Print /
          Import / Export / per-page / Column options. */}
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b bg-background print:hidden">
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
          <h1 className="text-base font-semibold truncate">Employee Master</h1>
          <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
            · {employees.length.toLocaleString()} employee{employees.length === 1 ? "" : "s"}
            {isFetching ? " · syncing…" : ""}
          </span>
        </div>
        <Button size="sm" className="h-8 shrink-0" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New employee
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0">
        <EmployeeMasterTable<EmployeeListItem>
          rows={employees}
          rowId={(e) => e.id}
          columns={COLUMNS}
          storageKey="employee-master-table-v1"
          isLoading={isLoading}
          recordLabel="EMPLOYEE MASTER"
          onRowClick={(e) => setViewingId(e.id)}
          onView={(e) => setViewingId(e.id)}
          onEdit={(e) => setEditingId(e.id)}
          onDelete={handleDelete}
        />
      </div>

      {/* Create-employee sheet */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
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

      {/* View employee sheet */}
      <Sheet open={!!viewingId} onOpenChange={(o) => !o && setViewingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {viewingId && (
            <ViewEmployeeSheet
              id={viewingId}
              onEdit={() => {
                setEditingId(viewingId);
                setViewingId(null);
              }}
            />
          )}
<<<<<<< HEAD
        </div>
      }
      preview={selectedId ? <EmployeePreview id={selectedId} /> : null}
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

    <Sheet open={!!editId} onOpenChange={(o) => !o && setEditId(null)}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto p-0"
      >
        <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
          <SheetTitle>Edit employee</SheetTitle>
          <SheetDescription>
            Update employee details.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5 sm:px-6 py-5">
          {editId && (
            <EditEmployeeForm
              id={editId}
              onDone={() => setEditId(null)}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
    </>
  );
}

function EditEmployeeForm({
  id,
  onDone,
}: {
  id: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const { data, isLoading } = useGetEmployeeQuery(id);
  const [updateEmployee, { isLoading: saving }] = useUpdateEmployeeMutation();

  if (isLoading || !data?.employee) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <EmployeeForm
      initial={data.employee}
      submitLabel="Save changes"
      submitting={saving}
      onCancel={onDone}
      onSubmit={async (payload) => {
        try {
          await updateEmployee({ id, body: payload }).unwrap();
          toast({ title: "Employee updated" });
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
  const { data } = useGetEmployeeQuery(id);
  const [removeEmployee, { isLoading: deleting }] =
    useDeleteEmployeeMutation();
  const e = data?.employee;
  if (!e) return <Skeleton className="h-5 w-40" />;
  const status = (e.status ?? "ACTIVE") as EmployeeStatus;

  const onDelete = async () => {
    if (
      !confirm(
        `Delete employee "${e.employeeName}"? This cannot be undone.`,
      )
    )
      return;
    try {
      await removeEmployee(e.id).unwrap();
      toast({ title: "Employee deleted" });
      onDeleted();
    } catch (err: any) {
      toast({
        title: "Could not delete",
        description: err?.data?.error || err?.message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <Badge variant={STATUS_VARIANT[status]} className="text-[10px] shrink-0">
        {STATUS_LABEL[status]}
      </Badge>
      <span className="font-semibold truncate text-sm">{e.employeeName}</span>
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
=======
        </SheetContent>
      </Sheet>

      {/* Edit employee sheet */}
      <Sheet open={!!editingId} onOpenChange={(o) => !o && setEditingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0">
          {editingId && (
            <EditEmployeeSheet
              id={editingId}
              onClose={() => setEditingId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
>>>>>>> f4dc3c5d72d52d953b0dcb8bdae8aa7e4df6523e
    </div>
  );
}

function ViewEmployeeSheet({ id, onEdit }: { id: string; onEdit: () => void }) {
  const { data, isLoading } = useGetEmployeeQuery(id);
  const e = data?.employee;

  if (isLoading || !e) {
    return (
      <div className="space-y-3 pt-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SheetHeader>
        <SheetTitle className="text-lg">{e.employeeName}</SheetTitle>
        <SheetDescription>
          {e.designation ?? "—"} · {e.department ?? "Unassigned"}
        </SheetDescription>
      </SheetHeader>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Fact label="Employee ID" value={e.id} />
        <Fact label="Status" value={e.status ? STATUS_LABEL[e.status] : "—"} />
        <Fact label="Email" value={e.emailAddress1 ?? "—"} />
        <Fact label="Phone" value={e.personalContact ?? "—"} />
        <Fact label="Gender" value={e.gender ?? "—"} />
        <Fact label="Joined" value={formatDate(e.dateOfJoining) || "—"} />
        <Fact label="Company" value={e.companyName ?? "—"} />
        <Fact label="Shift" value={e.shiftType ?? "—"} />
      </div>
      <div className="flex gap-2 pt-2">
        <Button size="sm" onClick={onEdit}>Edit</Button>
      </div>
    </div>
  );
}

function EditEmployeeSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const { toast } = useToast();
  const { data, isLoading } = useGetEmployeeQuery(id);
  const [updateEmployee, { isLoading: saving }] = useUpdateEmployeeMutation();
  const e = data?.employee;

  if (isLoading || !e) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  return (
    <>
      <SheetHeader className="px-5 sm:px-6 py-4 border-b sticky top-0 bg-background z-10">
        <SheetTitle>Edit {e.employeeName}</SheetTitle>
        <SheetDescription>Update employee details.</SheetDescription>
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
              toast({
                title: "Could not update",
                description: err?.data?.error || err?.message,
                variant: "destructive",
              });
            }
          }}
        />
      </div>
    </>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-0.5">
        {label}
      </div>
      <div className="font-medium break-words">{value}</div>
    </div>
  );
}
