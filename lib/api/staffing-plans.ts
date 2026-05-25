import { baseApi } from "./baseApi";

export type EmploymentType =
  | "FULL_TIME"
  | "PART_TIME"
  | "CONTRACT"
  | "INTERN"
  | "TEMPORARY"
  | "CONSULTANT";

export type StaffingPlanStatus =
  | "DRAFT"
  | "OPEN"
  | "ON_HOLD"
  | "FILLED"
  | "CANCELLED";

export interface StaffingPlan {
  id: string;
  planCode: string | null;
  profileName: string;
  department: string;
  designation: string;
  employmentType: EmploymentType;
  vacancies: number;
  estimatedCostPerPerson: string | number | null;
  totalEstimatedCost: string | number | null;
  status: StaffingPlanStatus;
  notes: string | null;
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
  plans: StaffingPlan[];
}

interface SingleResponse {
  success: boolean;
  plan: StaffingPlan;
}

export const staffingPlansApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getStaffingPlans: builder.query<ListResponse, void>({
      query: () => "/staffing-plans",
      providesTags: (result) =>
        result
          ? [
              ...result.plans.map((p) => ({
                type: "StaffingPlan" as const,
                id: p.id,
              })),
              { type: "StaffingPlans" as const, id: "LIST" },
            ]
          : [{ type: "StaffingPlans" as const, id: "LIST" }],
    }),

    getStaffingPlan: builder.query<SingleResponse, string>({
      query: (id) => `/staffing-plans/${id}`,
      providesTags: (_r, _e, id) => [{ type: "StaffingPlan", id }],
    }),

    createStaffingPlan: builder.mutation<SingleResponse, Record<string, any>>({
      query: (body) => ({
        url: "/staffing-plans",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "StaffingPlans", id: "LIST" }],
    }),

    updateStaffingPlan: builder.mutation<
      SingleResponse,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/staffing-plans/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "StaffingPlan", id },
        { type: "StaffingPlans", id: "LIST" },
      ],
    }),

    deleteStaffingPlan: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/staffing-plans/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "StaffingPlan", id },
        { type: "StaffingPlans", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetStaffingPlansQuery,
  useGetStaffingPlanQuery,
  useCreateStaffingPlanMutation,
  useUpdateStaffingPlanMutation,
  useDeleteStaffingPlanMutation,
} = staffingPlansApi;
