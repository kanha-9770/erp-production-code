import { baseApi } from "./baseApi";

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";

// Mirrors every field the Employee Form (static layout) collects, so the
// Employee Master table can render a column for any of them via the
// Manage Columns dialog. Keep this in sync with `employeeSelect` in
// lib/api-handlers/user-management.ts.
export interface EmployeeListItem {
  // Identifiers + Section 1 (Personal)
  id: string;
  userId: string | null;
  employeeName: string;
  /** Avatar URL — kept in sync with the linked User's profile photo. */
  employeeImage: string | null;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  dob: string | null;
  placeOfBirth: string | null;
  bloodGroup: string | null;
  maritalStatus: string | null;
  nationality: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;

  // Section 2 (Contact)
  emailAddress1: string | null;
  emailAddress2: string | null;
  personalContact: string | null;
  alternateNo1: string | null;
  alternateNo2: string | null;
  currentCity: string | null;
  currentState: string | null;
  currentCountry: string | null;
  permanentCity: string | null;
  permanentState: string | null;
  permanentCountry: string | null;
  emergencyContactName: string | null;
  emergencyPhone: string | null;
  emergencyRelation: string | null;

  // Section 3 (Employment)
  employmentType: string | null;
  department: string | null;
  designation: string | null;
  companyName: string | null;
  branch: string | null;
  status: EmployeeStatus | null;
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  shiftType: string | null;
  inTime: string | null;
  outTime: string | null;
  totalWorkingHours: string | number | null;
  employeeEngagementTeamName: string | null;
  // FK to the engagement-teams lookup row — useful for joins / filters
  // when the same team name appears across multiple records.
  engagementTeamId: string | null;
  yearsOfAgreement: number | null;

  // Section 4 (Documents)
  aadharCardNo: string | null;
  aadharCardUpload: string | null;
  panCardUpload: string | null;
  passportUpload: string | null;

  // Section 5 (Salary & Compensation)
  salaryMode: string | null;
  baseSalary: string | number | null;
  totalSalary: string | number | null;
  perHourSalary: string | number | null;
  isOvertimeApplicable: boolean | null;
  overTime: string | number | null;
  bonusAmount: string | number | null;
  bonusAfterYears: number | null;
  incrementMonth: number | null;
  givenSalary: string | number | null;
  nightAllowance: string | number | null;
  oneHourExtra: string | number | null;

  // Section 6 (Bank)
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  swiftCode: string | null;

  // Section 7 (Exit / Resignation)
  resignationLetterDate: string | null;
  reasonOfLeaving: string | null;
  noticeServed: boolean | null;
}

// Fields returned only on the GET /api/employees/[id] detail endpoint —
// everything in the list response PLUS richer/legacy fields not shown in
// the master table. Extends EmployeeListItem so detail consumers get
// everything in one shape.
export interface EmployeeDetail extends EmployeeListItem {
  // Section 1 extras (legacy / detail-only). employeeImage is inherited from
  // EmployeeListItem now that the list also returns it.
  nativePlace: string | null;
  country: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;

  // Section 2 extras (structured address lines + accommodation + multi-contact)
  currentAddressLine1: string | null;
  currentAddressLine2: string | null;
  currentPostalCode: string | null;
  currentAccommodationType: string | null;
  permanentSameAsCurrent: boolean | null;
  permanentAddressLine1: string | null;
  permanentAddressLine2: string | null;
  permanentPostalCode: string | null;
  permanentAccommodationType: string | null;
  emergencyContacts: Array<{ name: string; phone: string; relation: string }> | null;

  // Misc
  companySimIssue: boolean | null;
  createdAt: string;
  updatedAt: string;

  // Values for non-core fields added via the form-builder. Keyed by FormField.id.
  customFields?: Record<string, unknown> | null;
}

/** Roll-up totals + group-by counts over the FULL filtered set (not just the
 *  current page). Present only when the query asks for `withAggregates`. */
export interface EmployeeAggregates {
  totalSalarySum: number;
  avgSalary: number;
  statusCounts: Record<string, number>;
  departmentCounts: Array<{ department: string; count: number }>;
}

interface ListResponse {
  success: boolean;
  employees: EmployeeListItem[];
  isAdmin: boolean;
  /** Total rows matching the filters across ALL pages (server-side paginated). */
  total: number;
  page: number;
  pageSize: number;
  aggregates?: EmployeeAggregates;
}

/** Query args for the server-paginated employee list. All optional so the
 *  endpoint can still be called param-less to fetch everything. */
export interface EmployeeListArgs {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  gender?: string;
  department?: string;
  minSalary?: string;
  maxSalary?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  /** Advanced-filter conditions, serialised to JSON in the query string. */
  conditions?: Array<{ fieldId: string; operator: string; value?: string; value2?: string }>;
  /** Ask the server to also return roll-up totals + group-by counts. */
  withAggregates?: boolean;
}

/** Body for POST /api/employees/bulk. */
export interface BulkEmployeeArgs {
  action: "delete" | "status";
  ids: string[];
  status?: EmployeeStatus;
}

interface SingleResponse<T> {
  success: boolean;
  employee: T;
}

export const employeesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEmployeeList: builder.query<ListResponse, EmployeeListArgs | void>({
      query: (args) => {
        const a = (args ?? {}) as EmployeeListArgs;
        const qs = new URLSearchParams();
        if (a.page != null) qs.set("page", String(a.page));
        if (a.pageSize != null) qs.set("pageSize", String(a.pageSize));
        if (a.search) qs.set("search", a.search);
        if (a.status) qs.set("status", a.status);
        if (a.gender) qs.set("gender", a.gender);
        if (a.department) qs.set("department", a.department);
        if (a.minSalary) qs.set("minSalary", a.minSalary);
        if (a.maxSalary) qs.set("maxSalary", a.maxSalary);
        if (a.sortBy) qs.set("sortBy", a.sortBy);
        if (a.sortDir) qs.set("sortDir", a.sortDir);
        if (a.withAggregates) qs.set("withAggregates", "1");
        if (a.conditions && a.conditions.length) {
          qs.set("conditions", JSON.stringify(a.conditions));
        }
        const q = qs.toString();
        return q ? `/employees?${q}` : "/employees";
      },
      providesTags: (result) =>
        result
          ? [
              ...result.employees.map((e) => ({ type: "Employee" as const, id: e.id })),
              { type: "Employees" as const, id: "LIST" },
            ]
          : [{ type: "Employees" as const, id: "LIST" }],
    }),

    getEmployee: builder.query<SingleResponse<EmployeeDetail>, string>({
      query: (id) => `/employees/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Employee", id }],
    }),

    createEmployee: builder.mutation<SingleResponse<EmployeeDetail>, Record<string, any>>({
      query: (body) => ({
        url: "/employees",
        method: "POST",
        body,
      }),
      // An employee, the linked User account, the logged-in user's own
      // profile, and the user-management list are all the SAME identity. The
      // backend keeps them in sync (see updateEmployee handler), so the client
      // caches must refresh together — otherwise an edit shows in one screen
      // and stays stale in another. Invalidate the whole identity set.
      invalidatesTags: [
        { type: "Employees", id: "LIST" },
        "User",
        "AdminUsers",
      ],
    }),

    updateEmployee: builder.mutation<
      SingleResponse<EmployeeDetail>,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/employees/${id}`,
        method: "PUT",
        body,
      }),
      // See createEmployee: refresh the linked User account, the logged-in
      // user's own profile (/auth/me powers the header avatar + /profile), and
      // the user-management list, in addition to this employee + the list.
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Employee", id },
        { type: "Employees", id: "LIST" },
        "User",
        "AdminUsers",
      ],
    }),

    deleteEmployee: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/employees/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Employee", id },
        { type: "Employees", id: "LIST" },
        "User",
        "AdminUsers",
      ],
    }),

    // Bulk delete / bulk status-change for the Employee Master list. Refreshes
    // the whole identity set (same as single mutations) so every screen stays
    // in sync after the batch. The bare "Employee" tag (no id) invalidates
    // every cached employee DETAIL/preview query too, so an open preview pane
    // for one of the affected rows reflects the new status/removal immediately
    // — matching updateEmployee/deleteEmployee.
    bulkUpdateEmployees: builder.mutation<
      { success: boolean; action: string; affected: number },
      BulkEmployeeArgs
    >({
      query: (body) => ({
        url: "/employees/bulk",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        "Employee",
        { type: "Employees", id: "LIST" },
        "User",
        "AdminUsers",
      ],
    }),
  }),
});

export const {
  useGetEmployeeListQuery,
  useLazyGetEmployeeListQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
  useBulkUpdateEmployeesMutation,
} = employeesApi;
