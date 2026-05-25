import { baseApi } from "./baseApi";
import type { EmploymentType } from "./staffing-plans";
import type { ParsedResume } from "./resume";

export type JobApplicationStatus =
  | "NEW"
  | "SCREENING"
  | "INTERVIEWING"
  | "SHORTLISTED"
  | "OFFERED"
  | "HIRED"
  | "REJECTED"
  | "WITHDRAWN"
  | "ON_HOLD";

export type ApplicantSource =
  | "REFERRAL"
  | "JOB_PORTAL"
  | "COMPANY_WEBSITE"
  | "LINKEDIN"
  | "AGENCY"
  | "WALK_IN"
  | "CAMPUS"
  | "OTHER";

export interface JobApplication {
  id: string;
  applicationCode: string | null;

  jobOpeningId: string | null;
  jobOpening?: {
    id: string;
    profileName: string;
    jobCode: string | null;
    status: string;
  } | null;
  staffingPlanId: string | null;
  staffingPlan?: {
    id: string;
    profileName: string;
    planCode: string | null;
  } | null;

  department: string | null;
  designation: string | null;
  employmentType: EmploymentType | null;

  applicantName: string;
  applicantEmail: string;
  applicantMobile: string;
  applicantSource: ApplicantSource | null;

  applicantResumeUrl: string | null;
  applicantResumeName: string | null;

  resumeData: ParsedResume | null;
  resumeParsedText: string | null;
  resumeSkills: string | null;
  resumeTotalExperience: string | null;
  resumeEducation: string | null;
  resumeSummary: string | null;
  resumeParsedAt: string | null;

  coverLetter: string | null;
  salaryExpectation: string | null;
  jobDescription: string | null;

  applicantRating: number | null;
  status: JobApplicationStatus;

  // Values for non-core fields added via the form-builder. Keyed by FormField.id.
  customFields?: Record<string, unknown> | null;

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
  applications: JobApplication[];
}

interface SingleResponse {
  success: boolean;
  application: JobApplication;
}

export const jobApplicationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getJobApplications: builder.query<ListResponse, void>({
      query: () => "/job-applications",
      providesTags: (result) =>
        result
          ? [
              ...result.applications.map((a) => ({
                type: "JobApplication" as const,
                id: a.id,
              })),
              { type: "JobApplications" as const, id: "LIST" },
            ]
          : [{ type: "JobApplications" as const, id: "LIST" }],
    }),

    getJobApplication: builder.query<SingleResponse, string>({
      query: (id) => `/job-applications/${id}`,
      providesTags: (_r, _e, id) => [{ type: "JobApplication", id }],
    }),

    createJobApplication: builder.mutation<
      SingleResponse,
      Record<string, any>
    >({
      query: (body) => ({
        url: "/job-applications",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "JobApplications", id: "LIST" }],
    }),

    updateJobApplication: builder.mutation<
      SingleResponse,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/job-applications/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "JobApplication", id },
        { type: "JobApplications", id: "LIST" },
      ],
    }),

    deleteJobApplication: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/job-applications/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "JobApplication", id },
        { type: "JobApplications", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetJobApplicationsQuery,
  useGetJobApplicationQuery,
  useCreateJobApplicationMutation,
  useUpdateJobApplicationMutation,
  useDeleteJobApplicationMutation,
} = jobApplicationsApi;
