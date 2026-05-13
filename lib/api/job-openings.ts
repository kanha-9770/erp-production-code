import { baseApi } from "./baseApi";
import type { EmploymentType } from "./staffing-plans";

export type JobOpeningStatus =
  | "DRAFT"
  | "OPEN"
  | "ON_HOLD"
  | "CLOSED"
  | "CANCELLED";

export interface JobOpening {
  id: string;
  jobCode: string | null;
  staffingPlanId: string | null;
  staffingPlan?: {
    id: string;
    profileName: string;
    planCode: string | null;
  } | null;
  profileName: string;
  department: string;
  designation: string;
  employmentType: EmploymentType;
  vacancies: number;
  status: JobOpeningStatus;
  publishOnWebsite: boolean;
  salaryApprox: string | null;
  jobDescription: string;
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
}

interface ListResponse {
  success: boolean;
  openings: JobOpening[];
}

interface SingleResponse {
  success: boolean;
  opening: JobOpening;
}

export const jobOpeningsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getJobOpenings: builder.query<ListResponse, void>({
      query: () => "/job-openings",
      providesTags: (result) =>
        result
          ? [
              ...result.openings.map((o) => ({
                type: "JobOpening" as const,
                id: o.id,
              })),
              { type: "JobOpenings" as const, id: "LIST" },
            ]
          : [{ type: "JobOpenings" as const, id: "LIST" }],
    }),

    getJobOpening: builder.query<SingleResponse, string>({
      query: (id) => `/job-openings/${id}`,
      providesTags: (_r, _e, id) => [{ type: "JobOpening", id }],
    }),

    createJobOpening: builder.mutation<SingleResponse, Record<string, any>>({
      query: (body) => ({
        url: "/job-openings",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "JobOpenings", id: "LIST" }],
    }),

    updateJobOpening: builder.mutation<
      SingleResponse,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/job-openings/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "JobOpening", id },
        { type: "JobOpenings", id: "LIST" },
      ],
    }),

    deleteJobOpening: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/job-openings/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "JobOpening", id },
        { type: "JobOpenings", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetJobOpeningsQuery,
  useGetJobOpeningQuery,
  useCreateJobOpeningMutation,
  useUpdateJobOpeningMutation,
  useDeleteJobOpeningMutation,
} = jobOpeningsApi;
