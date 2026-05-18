import { baseApi } from "./baseApi";

export type AppointmentLetterStatus =
  | "DRAFT"
  | "ISSUED"
  | "SIGNED"
  | "REVOKED";

export interface AppointmentLetter {
  id: string;
  letterCode: string | null;

  jobOfferId: string | null;
  jobOffer?: {
    id: string;
    offerCode: string | null;
    status: string;
    offerDate: string;
  } | null;
  jobApplicationId: string | null;
  jobApplication?: {
    id: string;
    applicantName: string;
    applicantEmail: string | null;
    applicationCode: string | null;
    status: string;
  } | null;

  applicantName: string;
  applicantEmail: string | null;
  company: string | null;

  appointmentDate: string;
  templateName: string | null;
  status: AppointmentLetterStatus;

  title: string | null;
  introduction: string | null;
  description: string | null;
  closingNotes: string | null;

  signed: boolean;
  signedDate: string | null;

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
  letters: AppointmentLetter[];
}

interface SingleResponse {
  success: boolean;
  letter: AppointmentLetter;
  // Populated when the create/update path detected a SIGNED transition and
  // ran the auto-onboarding helper. One of the two will be set; both may be
  // absent when the letter did not transition into SIGNED.
  autoCreatedEmployee?: {
    id: string;
    alreadyExisted?: boolean;
  } | null;
  autoCreateEmployeeError?: string | null;
}

export const appointmentLettersApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAppointmentLetters: builder.query<ListResponse, void>({
      query: () => "/appointment-letters",
      providesTags: (result) =>
        result
          ? [
              ...result.letters.map((l) => ({
                type: "AppointmentLetter" as const,
                id: l.id,
              })),
              { type: "AppointmentLetters" as const, id: "LIST" },
            ]
          : [{ type: "AppointmentLetters" as const, id: "LIST" }],
    }),

    getAppointmentLetter: builder.query<SingleResponse, string>({
      query: (id) => `/appointment-letters/${id}`,
      providesTags: (_r, _e, id) => [{ type: "AppointmentLetter", id }],
    }),

    createAppointmentLetter: builder.mutation<
      SingleResponse,
      Record<string, any>
    >({
      query: (body) => ({
        url: "/appointment-letters",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "AppointmentLetters", id: "LIST" }],
    }),

    updateAppointmentLetter: builder.mutation<
      SingleResponse,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/appointment-letters/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "AppointmentLetter", id },
        { type: "AppointmentLetters", id: "LIST" },
      ],
    }),

    deleteAppointmentLetter: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/appointment-letters/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "AppointmentLetter", id },
        { type: "AppointmentLetters", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetAppointmentLettersQuery,
  useGetAppointmentLetterQuery,
  useCreateAppointmentLetterMutation,
  useUpdateAppointmentLetterMutation,
  useDeleteAppointmentLetterMutation,
} = appointmentLettersApi;
