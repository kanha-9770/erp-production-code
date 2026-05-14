import { baseApi } from "../baseApi";
import type {
  Lead,
  LeadActivity,
  PaginatedResponse,
  PropertyViewing,
  SingleResponse,
} from "./types";

export interface LeadListParams {
  status?: string;
  score?: string;
  source?: string;
  /** "AGENT" | "COMPANY" — pre-filter by capture origin. */
  origin?: string;
  /**
   * Coarse visibility filter for the agent UI:
   *   "mine"    — leads I own (assigned to me / created by me / won by me)
   *   "company" — open company-pool leads only
   *   "all"     — both
   * Defaults server-side: "mine" for regular agents, "all" for admin.
   */
  pool?: "mine" | "company" | "all";
  assignedAgentId?: string;
  search?: string;
  followupBefore?: string;
  limit?: number;
  offset?: number;
}

export interface DuplicateCapturedBy {
  id: string;
  name: string | null;
  email: string | null;
}

export interface LeadDuplicateGroup {
  original: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    photoUrl: string | null;
    photoPhash: string | null;
    assignedAgentId: string | null;
    createdById: string | null;
    createdAt: string;
    status: string;
    /** Best-effort "who captured this" (assigned agent, or creator). */
    capturedBy: DuplicateCapturedBy | null;
  };
  duplicates: Array<
    Lead & {
      duplicateOfLeadId: string | null;
      capturedBy: DuplicateCapturedBy | null;
      /** Which signal made this pair match; null if no signal currently agrees. */
      matchedBy: "phone" | "email" | "photo" | null;
      /** Hamming distance when matchedBy === "photo"; null otherwise. */
      phashDistance: number | null;
      /**
       * Which half of the compound hash signalled the photo match —
       * "dhash" (byte-level / re-encode) or "phash" (perceptual DCT).
       * null when matchedBy isn't "photo".
       */
      phashSignal: "dhash" | "phash" | null;
    }
  >;
}

export interface ViewingListParams {
  status?: string;
  agentId?: string;
  propertyId?: string;
  leadId?: string;
  from?: string;
  to?: string;
  limit?: number;
}

function toQuery(params: Record<string, any>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === "") continue;
    u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export const leadsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ─── Leads ──────────────────────────────────────────────────────────────
    getLeads: builder.query<PaginatedResponse<Lead>, LeadListParams | void>({
      query: (params) => `/real-estate/leads${toQuery(params ?? {})}`,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((l) => ({ type: "Lead" as const, id: l.id })),
              { type: "Leads" as const, id: "LIST" },
            ]
          : [{ type: "Leads" as const, id: "LIST" }],
    }),

    getLead: builder.query<SingleResponse<Lead & { activities: LeadActivity[]; viewings: PropertyViewing[] }>, string>({
      query: (id) => `/real-estate/leads/${id}`,
      providesTags: (_r, _e, id) => [
        { type: "Lead", id },
        { type: "LeadActivities", id },
      ],
    }),

    createLead: builder.mutation<SingleResponse<Lead>, Partial<Lead>>({
      query: (body) => ({
        url: "/real-estate/leads",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Leads", id: "LIST" }],
    }),

    updateLead: builder.mutation<
      SingleResponse<Lead>,
      { id: string; body: Partial<Lead> }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/leads/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Lead", id },
        { type: "Leads", id: "LIST" },
        { type: "LeadActivities", id },
      ],
    }),

    deleteLead: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/leads/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Lead", id },
        { type: "Leads", id: "LIST" },
      ],
    }),

    convertLead: builder.mutation<
      SingleResponse<Lead>,
      {
        id: string;
        buyer?: {
          name?: string;
          email?: string;
          phone?: string;
          panOrTaxId?: string;
          addressLine1?: string;
          city?: string;
          country?: string;
        };
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/real-estate/leads/${id}/convert`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Lead", id },
        { type: "Leads", id: "LIST" },
      ],
    }),

    // ─── Pool / duplicates ──────────────────────────────────────────────────

    /**
     * POST /api/real-estate/leads/:id/claim — pick up a company-pool lead.
     * Server-side refuses if the lead is AGENT-origin or already claimed
     * by someone else.
     */
    claimLead: builder.mutation<SingleResponse<Lead>, string>({
      query: (id) => ({
        url: `/real-estate/leads/${id}/claim`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Lead", id },
        { type: "Leads", id: "LIST" },
        { type: "LeadActivities", id },
      ],
    }),

    /**
     * GET /api/real-estate/admin/lead-duplicates — admin-only. Surfaces
     * every silent-duplicate group (original lead + every later capture
     * of the same person). Regular agents will see a 403 if they try.
     */
    getLeadDuplicates: builder.query<
      { success: boolean; data: LeadDuplicateGroup[] },
      void
    >({
      query: () => "/real-estate/admin/lead-duplicates",
      providesTags: [{ type: "Leads", id: "DUPLICATES" }],
    }),

    // ─── Lead Activities ────────────────────────────────────────────────────
    getLeadActivities: builder.query<{ success: boolean; data: LeadActivity[] }, string>({
      query: (id) => `/real-estate/leads/${id}/activities`,
      providesTags: (_r, _e, id) => [{ type: "LeadActivities", id }],
    }),

    addLeadActivity: builder.mutation<
      SingleResponse<LeadActivity>,
      {
        id: string;
        type: string;
        agentId?: string;
        occurredAt?: string;
        subject?: string;
        content?: string;
        outcome?: string;
        data?: Record<string, any>;
      }
    >({
      query: ({ id, ...body }) => ({
        url: `/real-estate/leads/${id}/activities`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "LeadActivities", id },
        { type: "Lead", id },
      ],
    }),

    // ─── Viewings ───────────────────────────────────────────────────────────
    getViewings: builder.query<{ success: boolean; data: PropertyViewing[] }, ViewingListParams | void>({
      query: (params) => `/real-estate/viewings${toQuery(params ?? {})}`,
      providesTags: [{ type: "Viewings", id: "LIST" }],
    }),

    createViewing: builder.mutation<
      SingleResponse<PropertyViewing>,
      {
        leadId: string;
        propertyId: string;
        scheduledAt: string;
        durationMin?: number;
        agentId?: string;
      }
    >({
      query: (body) => ({
        url: "/real-estate/viewings",
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { leadId }) => [
        { type: "Viewings", id: "LIST" },
        { type: "Lead", id: leadId },
        { type: "LeadActivities", id: leadId },
      ],
    }),

    updateViewing: builder.mutation<
      SingleResponse<PropertyViewing>,
      { id: string; body: Partial<PropertyViewing> }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/viewings/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "Viewings", id: "LIST" }],
    }),

    deleteViewing: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/viewings/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Viewings", id: "LIST" }],
    }),
  }),
});

export const {
  useGetLeadsQuery,
  useGetLeadQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  useDeleteLeadMutation,
  useConvertLeadMutation,
  useClaimLeadMutation,
  useGetLeadDuplicatesQuery,
  useGetLeadActivitiesQuery,
  useAddLeadActivityMutation,
  useGetViewingsQuery,
  useCreateViewingMutation,
  useUpdateViewingMutation,
  useDeleteViewingMutation,
} = leadsApi;
