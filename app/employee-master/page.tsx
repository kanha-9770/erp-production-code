"use client";

/**
 * Employee Master — premium workspace layout.
 *
 * This page replicates the exact UI pattern of the Real Estate properties page:
 * Resizable list + preview, advanced filtering, saved views, and spreadsheet-style
 * DataTable with pinned columns and local persistence.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  AdvancedFilter,
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

const PAGE_SIZE = 10;

export default function EmployeeMasterListPage() {
  const { toast } = useToast();
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ by: string; dir: "asc" | "desc" } | null>(null);
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

  // Server-side filtering + pagination — every filter / search / sort / page
  // is sent to the API which returns only the current page plus the total
  // count. Conditions are mapped to the {fieldId, operator, value, value2}
  // wire shape the endpoint understands.
  const queryArgs = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: filters.search || undefined,
      status: filters.status || undefined,
      gender: filters.gender || undefined,
      department: filters.department || undefined,
      minSalary: filters.minSalary || undefined,
      maxSalary: filters.maxSalary || undefined,
      sortBy: sort?.by,
      sortDir: sort?.dir,
      conditions: conditions.map((c) => ({
        fieldId: c.fieldId,
        operator: c.operator,
        value: c.value,
        value2: c.value2,
      })),
    }),
    [page, filters, sort, conditions],
  );

  const { data, isLoading, isFetching } = useGetEmployeeListQuery(queryArgs);
  // The server already filtered + paginated, so the rows we got ARE the page.
  const items = data?.employees ?? [];
  const total = data?.total ?? 0;

  // If the current page falls past the end of the result set (e.g. the last
  // row on the last page was deleted, or a filter shrank the total), snap
  // back to the last valid page so the user doesn't sit on an empty view.
  useEffect(() => {
    if (isFetching) return;
    const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [total, page, isFetching]);

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

  // Departments shown in the quick-filter chips. Derived from the current
  // page's rows — with server-side pagination we no longer hold every row in
  // memory. Users who need a department not on the current page can still
  // type it into search or use the Advanced filter.
  const departments = useMemo(() => {
    const set = new Set<string>();
    items.forEach(e => { if (e.department) set.add(e.department); });
    return Array.from(set).map(d => ({ value: d, label: d }));
  }, [items]);

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

  const activeFilterPills = useMemo(() => {
    const pills: Array<{ key: string; label: React.ReactNode }> = [];
    if (filters.search) pills.push({ key: "search", label: <>Search: <strong>{filters.search}</strong></> });
    if (filters.status) pills.push({ key: "status", label: <>Status: <strong>{filters.status}</strong></> });
    if (filters.department) pills.push({ key: "department", label: <>Dept: <strong>{filters.department}</strong></> });
    if (filters.minSalary) pills.push({ key: "minSalary", label: <>Min ₹{Number(filters.minSalary).toLocaleString()}</> });
    if (filters.maxSalary) pills.push({ key: "maxSalary", label: <>Max ₹{Number(filters.maxSalary).toLocaleString()}</> });
    return pills;
  }, [filters]);

  const columns: ColumnDef<EmployeeListItem>[] = useMemo(() => {
    // Tag a section's columns with their `group` so the Manage Columns
    // dialog renders them under that heading. Saves repeating
    // `group: "Section X"` on every column definition.
    const inGroup = (
      group: string,
      cols: ColumnDef<EmployeeListItem>[],
    ): ColumnDef<EmployeeListItem>[] => cols.map((c) => ({ ...c, group }));

    return [
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
      // Don't let the column be resized below the badge width — otherwise
      // "ACTIVE" / "ON_LEAVE" / "TERMINATED" get clipped mid-word.
      minWidth: 110,
      sortKey: "status",
      group: "Overview",
      cell: (e) => (
        <Badge
          variant={STATUS_VARIANT[e.status ?? "ACTIVE"]}
          className="text-[10px] whitespace-nowrap"
        >
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
      group: "Overview",
      cell: (e) => <span className="font-semibold">₹{Number(e.totalSalary || 0).toLocaleString()}</span>,
    },
    {
      id: "contact",
      header: "Contact",
      width: 220,
      group: "Overview",
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
      group: "Overview",
      cell: (e) => (
        <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="h-3 w-3" />
          {e.dateOfJoining ? new Date(e.dateOfJoining).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "N/A"}
        </span>
      ),
    },

    // ── Optional columns (mirror every Employee Form field) ────────────
    // All defaultHidden so the default view stays compact. HR opens the
    // Manage Columns dialog and toggles whichever fields they need for the
    // task at hand (payroll review, exit tracking, KYC audit, etc.).
    //
    // Sections are tagged via the `inGroup` helper so the dialog can render
    // them under a section header (Personal / Contact / Employment / etc.).

    // Section 1 — Personal Information
    ...inGroup("Personal Information", [
    {
      id: "salutation",
      header: "Salutation",
      width: 100,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.salutation ?? "—"}</span>,
    },
    {
      id: "firstName",
      header: "First Name",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-sm">{e.firstName ?? "—"}</span>,
    },
    {
      id: "lastName",
      header: "Last Name",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-sm">{e.lastName ?? "—"}</span>,
    },
    {
      id: "dob",
      header: "Date of Birth",
      width: 140,
      defaultHidden: true,
      cell: (e) => (
        <span className="text-xs text-muted-foreground">
          {e.dob ? new Date(e.dob).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
        </span>
      ),
    },
    {
      id: "gender",
      header: "Gender",
      width: 100,
      defaultHidden: true,
      cell: (e) => <span className="text-xs uppercase">{e.gender ?? "—"}</span>,
    },
    {
      id: "placeOfBirth",
      header: "Place of Birth",
      width: 160,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.placeOfBirth ?? "—"}</span>,
    },
    {
      id: "bloodGroup",
      header: "Blood Group",
      width: 110,
      defaultHidden: true,
      cell: (e) => <span className="text-xs font-medium">{e.bloodGroup ?? "—"}</span>,
    },
    {
      id: "maritalStatus",
      header: "Marital Status",
      width: 130,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.maritalStatus ?? "—"}</span>,
    },
    {
      id: "nationality",
      header: "Nationality",
      width: 120,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.nationality ?? "—"}</span>,
    },
    ]),

    // Section 2 — Contact Information
    ...inGroup("Contact Information", [
    {
      id: "emailAddress1",
      header: "Personal Email",
      width: 220,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.emailAddress1 ?? "—"}</span>,
    },
    {
      id: "emailAddress2",
      header: "Company Email",
      width: 220,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.emailAddress2 ?? "—"}</span>,
    },
    {
      id: "personalContact",
      header: "Cell Number",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.personalContact ?? "—"}</span>,
    },
    {
      id: "alternateNo1",
      header: "Alternate No 1",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.alternateNo1 ?? "—"}</span>,
    },
    {
      id: "alternateNo2",
      header: "Alternate No 2",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.alternateNo2 ?? "—"}</span>,
    },
    {
      id: "currentCity",
      header: "Current City",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.currentCity ?? "—"}</span>,
    },
    {
      id: "currentState",
      header: "Current State",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.currentState ?? "—"}</span>,
    },
    {
      id: "currentCountry",
      header: "Current Country",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.currentCountry ?? "—"}</span>,
    },
    {
      id: "permanentCity",
      header: "Permanent City",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.permanentCity ?? "—"}</span>,
    },
    {
      id: "permanentState",
      header: "Permanent State",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.permanentState ?? "—"}</span>,
    },
    {
      id: "permanentCountry",
      header: "Permanent Country",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.permanentCountry ?? "—"}</span>,
    },
    {
      id: "emergencyContactName",
      header: "Emergency Contact",
      width: 180,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.emergencyContactName ?? "—"}</span>,
    },
    {
      id: "emergencyPhone",
      header: "Emergency Phone",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.emergencyPhone ?? "—"}</span>,
    },
    {
      id: "emergencyRelation",
      header: "Emergency Relation",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.emergencyRelation ?? "—"}</span>,
    },
    ]),

    // Section 3 — Employment Details
    ...inGroup("Employment Details", [
    {
      id: "employmentType",
      header: "Employment Type",
      width: 150,
      defaultHidden: true,
      cell: (e) => <span className="text-xs uppercase">{e.employmentType ?? "—"}</span>,
    },
    {
      id: "department",
      header: "Department",
      width: 160,
      defaultHidden: true,
      sortKey: "department",
      cell: (e) => <span className="text-sm">{e.department ?? "—"}</span>,
    },
    {
      id: "designation",
      header: "Designation",
      width: 180,
      defaultHidden: true,
      sortKey: "designation",
      cell: (e) => <span className="text-sm">{e.designation ?? "—"}</span>,
    },
    {
      id: "companyName",
      header: "Company",
      width: 160,
      defaultHidden: true,
      cell: (e) => <span className="text-sm">{e.companyName ?? "—"}</span>,
    },
    {
      id: "branch",
      header: "Branch",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.branch ?? "—"}</span>,
    },
    {
      id: "shiftType",
      header: "Shift Type",
      width: 130,
      defaultHidden: true,
      cell: (e) => <span className="text-xs uppercase">{e.shiftType ?? "—"}</span>,
    },
    {
      id: "inTime",
      header: "In Time",
      width: 100,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.inTime ?? "—"}</span>,
    },
    {
      id: "outTime",
      header: "Out Time",
      width: 100,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.outTime ?? "—"}</span>,
    },
    {
      id: "totalWorkingHours",
      header: "Working Hours/Day",
      width: 150,
      align: "right",
      defaultHidden: true,
      cell: (e) => (
        <span className="font-mono text-xs tabular-nums">
          {e.totalWorkingHours != null ? `${e.totalWorkingHours}h` : "—"}
        </span>
      ),
    },
    {
      id: "engagementTeam",
      header: "Engagement Team",
      width: 180,
      defaultHidden: true,
      cell: (e) => <span className="text-sm">{e.employeeEngagementTeamName ?? "—"}</span>,
    },
    {
      id: "yearsOfAgreement",
      header: "Years of Agreement",
      width: 150,
      align: "right",
      defaultHidden: true,
      cell: (e) => (
        <span className="font-mono text-xs tabular-nums">
          {e.yearsOfAgreement != null ? `${e.yearsOfAgreement} yr` : "—"}
        </span>
      ),
    },
    ]),

    // Section 4 — Document Uploads
    ...inGroup("Document Uploads", [
    {
      id: "aadharCardNo",
      header: "Aadhaar Number",
      width: 170,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.aadharCardNo ?? "—"}</span>,
    },
    {
      id: "aadharCardUpload",
      header: "Aadhaar Upload",
      width: 130,
      defaultHidden: true,
      cell: (e) =>
        e.aadharCardUpload ? (
          <a href={e.aadharCardUpload} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "panCardUpload",
      header: "PAN Upload",
      width: 130,
      defaultHidden: true,
      cell: (e) =>
        e.panCardUpload ? (
          <a href={e.panCardUpload} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "passportUpload",
      header: "Passport Upload",
      width: 140,
      defaultHidden: true,
      cell: (e) =>
        e.passportUpload ? (
          <a href={e.passportUpload} target="_blank" rel="noreferrer" className="text-xs text-primary underline-offset-2 hover:underline">
            View
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    ]),

    // Section 5 — Salary & Compensation
    ...inGroup("Salary & Compensation", [
    {
      id: "salaryMode",
      header: "Salary Mode",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.salaryMode ?? "—"}</span>,
    },
    {
      id: "baseSalary",
      header: "Base Salary",
      width: 130,
      align: "right",
      defaultHidden: true,
      cell: (e) =>
        e.baseSalary ? (
          <span className="font-mono text-xs tabular-nums">₹{Number(e.baseSalary).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "perHourSalary",
      header: "Per Hour Salary",
      width: 140,
      align: "right",
      defaultHidden: true,
      cell: (e) =>
        e.perHourSalary ? (
          <span className="font-mono text-xs tabular-nums">₹{Number(e.perHourSalary).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "isOvertimeApplicable",
      header: "Overtime Applicable",
      width: 150,
      defaultHidden: true,
      cell: (e) => (
        <span className="text-xs font-medium">
          {e.isOvertimeApplicable === true ? "Yes" : e.isOvertimeApplicable === false ? "No" : "—"}
        </span>
      ),
    },
    {
      id: "overTime",
      header: "Overtime Rate",
      width: 130,
      align: "right",
      defaultHidden: true,
      cell: (e) =>
        e.overTime ? (
          <span className="font-mono text-xs tabular-nums">₹{Number(e.overTime).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "bonusAmount",
      header: "Bonus Amount",
      width: 130,
      align: "right",
      defaultHidden: true,
      cell: (e) =>
        e.bonusAmount ? (
          <span className="font-mono text-xs tabular-nums">₹{Number(e.bonusAmount).toLocaleString()}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "bonusAfterYears",
      header: "Bonus After (Yrs)",
      width: 140,
      align: "right",
      defaultHidden: true,
      cell: (e) => (
        <span className="font-mono text-xs tabular-nums">
          {e.bonusAfterYears != null ? `${e.bonusAfterYears}` : "—"}
        </span>
      ),
    },
    {
      id: "incrementMonth",
      header: "Increment Month",
      width: 140,
      defaultHidden: true,
      cell: (e) => {
        const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return (
          <span className="text-xs">
            {e.incrementMonth ? MONTHS[e.incrementMonth] ?? `${e.incrementMonth}` : "—"}
          </span>
        );
      },
    },
    ]),

    // Section 6 — Bank Details
    ...inGroup("Bank Details", [
    {
      id: "bankName",
      header: "Bank Name",
      width: 160,
      defaultHidden: true,
      cell: (e) => <span className="text-xs">{e.bankName ?? "—"}</span>,
    },
    {
      id: "bankAccountNo",
      header: "Bank Account No",
      width: 170,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs">{e.bankAccountNo ?? "—"}</span>,
    },
    {
      id: "ifscCode",
      header: "IFSC Code",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs uppercase">{e.ifscCode ?? "—"}</span>,
    },
    {
      id: "swiftCode",
      header: "SWIFT / BIC",
      width: 140,
      defaultHidden: true,
      cell: (e) => <span className="font-mono text-xs uppercase">{e.swiftCode ?? "—"}</span>,
    },
    ]),

    // Section 7 — Exit / Resignation
    ...inGroup("Exit / Resignation", [
    {
      id: "resignationLetterDate",
      header: "Resignation Date",
      width: 150,
      defaultHidden: true,
      cell: (e) => (
        <span className="text-xs text-muted-foreground">
          {e.resignationLetterDate
            ? new Date(e.resignationLetterDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
        </span>
      ),
    },
    {
      id: "dateOfLeaving",
      header: "Date of Leaving",
      width: 140,
      defaultHidden: true,
      cell: (e) => (
        <span className="text-sm text-muted-foreground">
          {e.dateOfLeaving
            ? new Date(e.dateOfLeaving).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
            : "—"}
        </span>
      ),
    },
    {
      id: "reasonOfLeaving",
      header: "Reason of Leaving",
      width: 200,
      defaultHidden: true,
      cell: (e) => <span className="text-xs text-muted-foreground truncate">{e.reasonOfLeaving ?? "—"}</span>,
    },
    {
      id: "noticeServed",
      header: "Notice Served",
      width: 130,
      defaultHidden: true,
      cell: (e) => (
        <span className="text-xs font-medium">
          {e.noticeServed === true ? "Yes" : e.noticeServed === false ? "No" : "—"}
        </span>
      ),
    },
    ]),

    // System / Identifiers
    ...inGroup("System", [
    {
      id: "userId",
      header: "User ID",
      width: 130,
      defaultHidden: true,
      cell: (e) => (
        <span className="font-mono text-[10px] text-muted-foreground">
          {e.userId ?? "—"}
        </span>
      ),
    },
    ]),
  ];
  }, []);

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
              subtitle={`${total.toLocaleString()} record${total === 1 ? "" : "s"}${isFetching ? " · syncing…" : ""}`}
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
              <AdvancedFilter
                fields={filterFields}
                value={conditions}
                onChange={(c) => { setConditions(c); setPage(0); }}
              />
              <ManageColumnsButton
                tableId="employee-master"
                columns={columns}
                variant="dialog"
              />
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
                serverPagination={{
                  page,
                  pageSize: PAGE_SIZE,
                  total,
                  onPageChange: setPage,
                }}
                onSortChange={(column, direction) => {
                  setSort(column && direction ? { by: column, dir: direction } : null);
                  setPage(0);
                }}
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
                  // If HR picked a new photo, upload it first and stamp the
                  // resulting URL onto the payload so it persists as the
                  // employee's avatar (Employee.employeeImage). The face
                  // enroll call below is separate — it's only for biometric
                  // attendance, not for storing the profile image.
                  if (extras?.facePhoto) {
                    const fd = new FormData();
                    fd.append("file", extras.facePhoto);
                    fd.append("type", "employee");
                    const up = await fetch("/api/upload", { method: "POST", body: fd });
                    const upJson = await up.json().catch(() => null);
                    if (up.ok && upJson?.success && upJson.imageUrl) {
                      payload.employeeImage = upJson.imageUrl;
                    } else {
                      toast({
                        title: "Photo upload failed",
                        description:
                          upJson?.details ||
                          upJson?.error ||
                          `Server returned ${up.status}`,
                        variant: "destructive",
                      });
                    }
                  }
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
           {e.employeeImage ? (
             // eslint-disable-next-line @next/next/no-img-element
             <img
               src={e.employeeImage}
               alt={e.employeeName}
               className="h-full w-full object-cover"
               onError={(ev) => {
                 // Hide the broken image and fall back to the generic
                 // icon below — the URL is saved but the host is down
                 // or the file is missing.
                 const img = ev.currentTarget;
                 img.style.display = "none";
                 const fb = img.nextElementSibling as HTMLElement | null;
                 if (fb) fb.style.display = "block";
               }}
             />
           ) : null}
           <User2
             className="h-10 w-10 text-primary"
             style={{ display: e.employeeImage ? "none" : "block" }}
           />
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
  // Force a refetch every time the sheet remounts so that the edit form
  // always reflects the latest persisted row, never a stale RTK cache
  // entry left over from before the most recent save (e.g. after a fresh
  // employeeImage URL was written).
  const { data, isLoading } = useGetEmployeeQuery(id, {
    refetchOnMountOrArgChange: true,
  });
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
          onSubmit={async (payload, extras) => {
            try {
              // If HR replaced the photo during edit, upload the new file and
              // stamp its public URL onto the payload before saving so the
              // avatar updates alongside the rest of the form.
              if (extras?.facePhoto) {
                const fd = new FormData();
                fd.append("file", extras.facePhoto);
                fd.append("type", "employee");
                const up = await fetch("/api/upload", { method: "POST", body: fd });
                const upJson = await up.json().catch(() => null);
                if (up.ok && upJson?.success && upJson.imageUrl) {
                  payload.employeeImage = upJson.imageUrl;
                } else {
                  toast({
                    title: "Photo upload failed",
                    description:
                      upJson?.details ||
                      upJson?.error ||
                      `Server returned ${up.status}`,
                    variant: "destructive",
                  });
                }
              }
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