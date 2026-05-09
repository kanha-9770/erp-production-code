import { baseApi } from "../baseApi";
import type {
  AgentComplianceDetail,
  ComplianceDocument,
  MyComplianceResponse,
  PromotionResult,
  SingleResponse,
} from "./types";

export const complianceApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ─── Mine ────────────────────────────────────────────────────────────────
    getMyCompliance: builder.query<SingleResponse<MyComplianceResponse>, void>({
      query: () => "/real-estate/compliance/my-documents",
      providesTags: [{ type: "MyCompliance", id: "ME" }],
    }),

    uploadMyDocument: builder.mutation<
      SingleResponse<ComplianceDocument>,
      {
        type: string;
        name: string;
        url: string;
        documentNumber?: string;
        issuedBy?: string;
        issuedAt?: string;
        expiryDate?: string;
      }
    >({
      query: (body) => ({
        url: "/real-estate/compliance/my-documents",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "MyCompliance", id: "ME" },
        { type: "ComplianceQueue", id: "LIST" },
      ],
    }),

    deleteComplianceDocument: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/compliance/documents/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [
        { type: "MyCompliance", id: "ME" },
        { type: "ComplianceQueue", id: "LIST" },
      ],
    }),

    // ─── Verification queue (admin) ──────────────────────────────────────────
    getComplianceQueue: builder.query<
      { success: boolean; data: ComplianceDocument[] },
      { status?: string } | void
    >({
      query: (params) => {
        const u = new URLSearchParams();
        if (params?.status) u.set("status", params.status);
        const qs = u.toString();
        return `/real-estate/compliance/queue${qs ? `?${qs}` : ""}`;
      },
      providesTags: [{ type: "ComplianceQueue", id: "LIST" }],
    }),

    verifyComplianceDocument: builder.mutation<
      SingleResponse<ComplianceDocument>,
      string
    >({
      query: (id) => ({
        url: `/real-estate/compliance/documents/${id}/verify`,
        method: "POST",
      }),
      invalidatesTags: [
        { type: "ComplianceQueue", id: "LIST" },
        { type: "MyCompliance", id: "ME" },
      ],
    }),

    rejectComplianceDocument: builder.mutation<
      SingleResponse<ComplianceDocument>,
      { id: string; reason: string }
    >({
      query: ({ id, reason }) => ({
        url: `/real-estate/compliance/documents/${id}/reject`,
        method: "POST",
        body: { reason },
      }),
      invalidatesTags: [
        { type: "ComplianceQueue", id: "LIST" },
        { type: "MyCompliance", id: "ME" },
      ],
    }),

    recomputeAllCompliance: builder.mutation<
      { success: boolean; evaluated: number; COMPLIANT: number; PENDING_KYC: number; NON_COMPLIANT: number },
      void
    >({
      query: () => ({
        url: "/real-estate/compliance/recompute-all",
        method: "POST",
      }),
      invalidatesTags: [
        { type: "ComplianceQueue", id: "LIST" },
        { type: "Agents", id: "LIST" },
      ],
    }),

    getExpiringSoon: builder.query<
      { success: boolean; data: ComplianceDocument[] },
      { days?: number } | void
    >({
      query: (params) => {
        const u = new URLSearchParams();
        if (params?.days) u.set("days", String(params.days));
        const qs = u.toString();
        return `/real-estate/compliance/expiring${qs ? `?${qs}` : ""}`;
      },
      providesTags: [{ type: "ComplianceExpiring", id: "LIST" }],
    }),

    getAgentCompliance: builder.query<
      SingleResponse<AgentComplianceDetail>,
      string
    >({
      query: (id) => `/real-estate/compliance/agents/${id}/documents`,
      providesTags: (_r, _e, id) => [{ type: "AgentCompliance", id }],
    }),

    // ─── Rank promotion ─────────────────────────────────────────────────────
    evaluateRankPromotions: builder.mutation<
      { success: boolean; mode: "PREVIEW" | "AUTO"; data: PromotionResult[] },
      "PREVIEW" | "AUTO"
    >({
      query: (mode) => ({
        url: "/real-estate/ranks/evaluate",
        method: "POST",
        body: { mode },
      }),
      invalidatesTags: (_r, _e, mode) =>
        mode === "AUTO"
          ? [
              { type: "Agents", id: "LIST" },
              { type: "AgentTree", id: "ALL" },
              { type: "MyWallet", id: "ME" },
              { type: "Wallets", id: "LIST" },
            ]
          : [],
    }),
  }),
});

export const {
  useGetMyComplianceQuery,
  useUploadMyDocumentMutation,
  useDeleteComplianceDocumentMutation,
  useGetComplianceQueueQuery,
  useVerifyComplianceDocumentMutation,
  useRejectComplianceDocumentMutation,
  useRecomputeAllComplianceMutation,
  useGetExpiringSoonQuery,
  useGetAgentComplianceQuery,
  useEvaluateRankPromotionsMutation,
} = complianceApi;
