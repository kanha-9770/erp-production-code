import { baseApi } from "./baseApi";

export type EmployeeReferralStatus =
  | "NEW"
  | "REVIEWED"
  | "INTERVIEWING"
  | "HIRED"
  | "REJECTED";

export interface EmployeeReferral {
  id: string;
  referralCode: string | null;

  applicantName: string;
  applicantEmail: string;
  applicantMobile: string;
  applicantResumeUrl: string | null;
  applicantResumeName: string | null;

  referralDate: string;
  designation: string | null;

  referringEmployeeId: string;
  referringEmployee?: {
    id: string;
    employeeName: string;
    department: string | null;
    designation: string | null;
    emailAddress1: string | null;
  } | null;
  referrerFirstName: string;
  referrerDepartment: string | null;

  remark: string | null;
  status: EmployeeReferralStatus;

  organizationId: string | null;
  createdById: string | null;
  createdBy?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string;
  } | null;

  createdAt: string;
  updatedAt: string;
  // Values for non-core fields added via the form-builder. Keyed by FormField.id.
  customFields?: Record<string, unknown> | null;
}

interface ListResponse {
  success: boolean;
  referrals: EmployeeReferral[];
}

interface SingleResponse {
  success: boolean;
  referral: EmployeeReferral;
}

export const employeeReferralsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getEmployeeReferrals: builder.query<ListResponse, void>({
      query: () => "/employee-referrals",
      providesTags: (result) =>
        result
          ? [
              ...result.referrals.map((r) => ({
                type: "EmployeeReferral" as const,
                id: r.id,
              })),
              { type: "EmployeeReferrals" as const, id: "LIST" },
            ]
          : [{ type: "EmployeeReferrals" as const, id: "LIST" }],
    }),

    getEmployeeReferral: builder.query<SingleResponse, string>({
      query: (id) => `/employee-referrals/${id}`,
      providesTags: (_r, _e, id) => [{ type: "EmployeeReferral", id }],
    }),

    createEmployeeReferral: builder.mutation<
      SingleResponse,
      Record<string, any>
    >({
      query: (body) => ({
        url: "/employee-referrals",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "EmployeeReferrals", id: "LIST" }],
    }),

    updateEmployeeReferral: builder.mutation<
      SingleResponse,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/employee-referrals/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "EmployeeReferral", id },
        { type: "EmployeeReferrals", id: "LIST" },
      ],
    }),

    deleteEmployeeReferral: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/employee-referrals/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "EmployeeReferral", id },
        { type: "EmployeeReferrals", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetEmployeeReferralsQuery,
  useGetEmployeeReferralQuery,
  useCreateEmployeeReferralMutation,
  useUpdateEmployeeReferralMutation,
  useDeleteEmployeeReferralMutation,
} = employeeReferralsApi;
