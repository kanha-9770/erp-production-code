/**
 * Performance Management RTK Query slice.
 *
 * Covers KRA + Appraisal records that back /app/performance/{kra,appraisal}.
 * Hosts are not segregated by HR vs employee — the page-level canManage
 * gate decides whether write actions are exposed, and the server enforces
 * org-scoping. The list endpoints accept an optional employeeId filter so
 * the same query can power "my KRAs" on a self-service view.
 */

import { baseApi } from "./baseApi";

export type KraStatus = "DRAFT" | "ACTIVE" | "ACHIEVED" | "AT_RISK" | "MISSED";
export type KraPeriod = "Q1" | "Q2" | "Q3" | "Q4" | "ANNUAL";

export interface KraItem {
  id: string;
  displayId: string | null;
  organizationId: string;

  employeeId: string | null;
  employeeName: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  department: string | null;
  employeeEngagementTeamName: string | null;

  objective: string;
  weight: number | string; // Prisma Decimal serialises as string in some configs
  target: string | null;
  actual: string | null;
  progress: number;

  period: KraPeriod;
  year: number;
  status: KraStatus;
  notes: string | null;

  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AppraisalStatus = "PENDING" | "IN_REVIEW" | "COMPLETED" | "ACKNOWLEDGED";
export type AppraisalCycle = "Q1" | "Q2" | "Q3" | "Q4" | "MID_YEAR" | "ANNUAL";

export interface AppraisalItem {
  id: string;
  displayId: string | null;
  organizationId: string;

  employeeId: string | null;
  employeeName: string;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  department: string | null;
  employeeEngagementTeamName: string | null;

  reviewerId: string | null;
  reviewerName: string;

  cycle: AppraisalCycle;
  year: number;
  rating: number | string;
  status: AppraisalStatus;

  strengths: string | null;
  improvements: string | null;
  comments: string | null;

  submittedAt: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListResponse<T> {
  success: boolean;
  items: T[];
}
interface SingleResponse<T> {
  success: boolean;
  item: T;
}

export const performanceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // KRA
    getKras: builder.query<ListResponse<KraItem>, { employeeId?: string } | void>({
      query: (args) => {
        const a = (args ?? {}) as { employeeId?: string };
        const qs = new URLSearchParams();
        if (a.employeeId) qs.set("employeeId", a.employeeId);
        const q = qs.toString();
        return q ? `/performance/kras?${q}` : "/performance/kras";
      },
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((k) => ({ type: "Kra" as const, id: k.id })),
              { type: "Kras" as const, id: "LIST" },
            ]
          : [{ type: "Kras" as const, id: "LIST" }],
    }),

    getKra: builder.query<SingleResponse<KraItem>, string>({
      query: (id) => `/performance/kras/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Kra", id }],
    }),

    createKra: builder.mutation<SingleResponse<KraItem>, Record<string, any>>({
      query: (body) => ({ url: "/performance/kras", method: "POST", body }),
      invalidatesTags: [{ type: "Kras", id: "LIST" }],
    }),

    updateKra: builder.mutation<
      SingleResponse<KraItem>,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/performance/kras/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Kra", id },
        { type: "Kras", id: "LIST" },
      ],
    }),

    deleteKra: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({ url: `/performance/kras/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Kra", id },
        { type: "Kras", id: "LIST" },
      ],
    }),

    // Appraisal
    getAppraisals: builder.query<
      ListResponse<AppraisalItem>,
      { employeeId?: string } | void
    >({
      query: (args) => {
        const a = (args ?? {}) as { employeeId?: string };
        const qs = new URLSearchParams();
        if (a.employeeId) qs.set("employeeId", a.employeeId);
        const q = qs.toString();
        return q ? `/performance/appraisals?${q}` : "/performance/appraisals";
      },
      providesTags: (res) =>
        res
          ? [
              ...res.items.map((a) => ({ type: "Appraisal" as const, id: a.id })),
              { type: "Appraisals" as const, id: "LIST" },
            ]
          : [{ type: "Appraisals" as const, id: "LIST" }],
    }),

    getAppraisal: builder.query<SingleResponse<AppraisalItem>, string>({
      query: (id) => `/performance/appraisals/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Appraisal", id }],
    }),

    createAppraisal: builder.mutation<
      SingleResponse<AppraisalItem>,
      Record<string, any>
    >({
      query: (body) => ({ url: "/performance/appraisals", method: "POST", body }),
      invalidatesTags: [{ type: "Appraisals", id: "LIST" }],
    }),

    updateAppraisal: builder.mutation<
      SingleResponse<AppraisalItem>,
      { id: string; body: Record<string, any> }
    >({
      query: ({ id, body }) => ({
        url: `/performance/appraisals/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Appraisal", id },
        { type: "Appraisals", id: "LIST" },
      ],
    }),

    deleteAppraisal: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/performance/appraisals/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Appraisal", id },
        { type: "Appraisals", id: "LIST" },
      ],
    }),
  }),
});

export const {
  useGetKrasQuery,
  useGetKraQuery,
  useCreateKraMutation,
  useUpdateKraMutation,
  useDeleteKraMutation,
  useGetAppraisalsQuery,
  useGetAppraisalQuery,
  useCreateAppraisalMutation,
  useUpdateAppraisalMutation,
  useDeleteAppraisalMutation,
} = performanceApi;
