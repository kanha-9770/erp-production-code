import { baseApi } from "./baseApi";

export type JobOfferStatus =
  | "DRAFT"
  | "SENT"
  | "ACCEPTED"
  | "REJECTED"
  | "WITHDRAWN"
  | "EXPIRED";

export interface JobOffer {
  id: string;
  offerCode: string | null;

  jobApplicationId: string | null;
  jobApplication?: {
    id: string;
    applicantName: string;
    applicantEmail: string | null;
    applicationCode: string | null;
    status: string;
  } | null;
  jobOpeningId: string | null;
  jobOpening?: {
    id: string;
    profileName: string;
    jobCode: string | null;
  } | null;
  staffingPlanId: string | null;
  staffingPlan?: {
    id: string;
    profileName: string;
    planCode: string | null;
  } | null;

  applicantName: string;
  applicantEmail: string | null;

  offerDate: string;
  status: JobOfferStatus;

  jobOfferTerm: string | null;
  valueDescription: string | null;
  termsAndConditions: string | null;

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
  offers: JobOffer[];
}

interface SingleResponse {
  success: boolean;
  offer: JobOffer;
}

export const jobOffersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getJobOffers: builder.query<ListResponse, void>({
      query: () => "/job-offers",
      providesTags: (result) =>
        result
          ? [
              ...result.offers.map((o) => ({
                type: "JobOffer" as const,
                id: o.id,
              })),
              { type: "JobOffers" as const, id: "LIST" },
            ]
          : [{ type: "JobOffers" as const, id: "LIST" }],
    }),

    getJobOffer: builder.query<SingleResponse, string>({
      query: (id) => `/job-offers/${id}`,
      providesTags: (_r, _e, id) => [{ type: "JobOffer", id }],
    }),

    createJobOffer: builder.mutation<SingleResponse, Record<string, any>>({
      query: (body) => ({
        url: "/job-offers",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "JobOffers", id: "LIST" }],
    }),

    updateJobOffer: builder.mutation<
      SingleResponse,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/job-offers/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "JobOffer", id },
        { type: "JobOffers", id: "LIST" },
      ],
    }),

    deleteJobOffer: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/job-offers/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "JobOffer", id },
        { type: "JobOffers", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetJobOffersQuery,
  useGetJobOfferQuery,
  useCreateJobOfferMutation,
  useUpdateJobOfferMutation,
  useDeleteJobOfferMutation,
} = jobOffersApi;
