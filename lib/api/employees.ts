import { baseApi } from "./baseApi";

export type EmployeeStatus = "ACTIVE" | "INACTIVE" | "ON_LEAVE" | "TERMINATED";

export interface EmployeeListItem {
  id: string;
  userId: string | null;
  employeeName: string;
  department: string | null;
  designation: string | null;
  totalSalary: string | number | null;
  givenSalary: string | number | null;
  bonusAmount: string | number | null;
  nightAllowance: string | number | null;
  overTime: string | number | null;
  oneHourExtra: string | number | null;
  status: EmployeeStatus | null;
  emailAddress1: string | null;
  personalContact: string | null;
  dateOfJoining: string | null;
  dateOfLeaving: string | null;
  companyName: string | null;
  employeeEngagementTeamName: string | null;
  gender: "MALE" | "FEMALE" | "OTHER" | null;
  shiftType: string | null;
}

export interface EmployeeDetail extends EmployeeListItem {
  dob: string | null;
  nativePlace: string | null;
  country: string | null;
  permanentAddress: string | null;
  currentAddress: string | null;
  alternateNo1: string | null;
  alternateNo2: string | null;
  emailAddress2: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  ifscCode: string | null;
  inTime: string | null;
  outTime: string | null;
  incrementMonth: number | null;
  yearsOfAgreement: number | null;
  bonusAfterYears: number | null;
  aadharCardNo: string | null;
  companySimIssue: boolean | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse {
  success: boolean;
  employees: EmployeeListItem[];
  isAdmin: boolean;
}

interface SingleResponse<T> {
  success: boolean;
  employee: T;
}

export const employeesApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEmployeeList: builder.query<ListResponse, void>({
      query: () => "/employees",
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
      invalidatesTags: [{ type: "Employees", id: "LIST" }],
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
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Employee", id },
        { type: "Employees", id: "LIST" },
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
      ],
    }),
  }),
});

export const {
  useGetEmployeeListQuery,
  useGetEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
} = employeesApi;
