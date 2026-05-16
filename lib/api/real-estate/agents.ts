import { baseApi } from "../baseApi";
import type {
  AgentProfile,
  AgentTreeNode,
  PaginatedResponse,
  Rank,
  SingleResponse,
} from "./types";
import type { SlabProgress } from "./finance";

// Slab history payload — mirrors lib/real-estate/slab-engine.ts
// AgentSlabHistory. Kept here (not in types.ts) so it stays next to its hook.
export interface SlabHistoryDealRow {
  ledgerId: string;
  transactionId: string;
  transactionCode: string | null;
  closedAt: string | null;
  dealArea: number;
  cumulativeArea: number;
  rateApplied: number;
  directIncome: number;
  propertyTitle: string | null;
  propertyCode: string | null;
}
export interface SlabUpgradeEvent {
  at: string;
  triggeredByLedgerId: string;
  triggeredByTransactionId: string;
  fromSlab: { sortOrder: number; minArea: number; maxArea: number | null; ratePerUnit: number };
  toSlab:   { sortOrder: number; minArea: number; maxArea: number | null; ratePerUnit: number };
}
export interface SlabDesignationUnlock {
  at: string;
  triggeredByLedgerId: string | null;
  code: string;
  name: string;
  rewardType: string;
  rewardDescription: string;
  minCumulativeArea: number;
}
export interface OverrideEarningRow {
  splitId: string;
  transactionId: string;
  transactionCode: string | null;
  closedAt: string | null;
  level: number | null;
  amount: number;
  status: string;
  fromAgentName: string | null;
  propertyTitle: string | null;
}
export interface AgentSlabHistory {
  progress: SlabProgress;
  deals: SlabHistoryDealRow[];
  slabUpgrades: SlabUpgradeEvent[];
  designationUnlocks: SlabDesignationUnlock[];
  overrides: { rows: OverrideEarningRow[]; totalAmount: number };
}

export interface AgentListParams {
  status?: string;
  compliance?: string;
  rankId?: string;
  search?: string;
  limit?: number;
  offset?: number;
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

export const agentsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // ─── Agents ─────────────────────────────────────────────────────────────
    getAgents: builder.query<PaginatedResponse<AgentProfile>, AgentListParams | void>({
      query: (params) => `/real-estate/agents${toQuery(params ?? {})}`,
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((a) => ({ type: "Agent" as const, id: a.id })),
              { type: "Agents" as const, id: "LIST" },
            ]
          : [{ type: "Agents" as const, id: "LIST" }],
    }),

    getAgent: builder.query<SingleResponse<AgentProfile>, string>({
      query: (id) => `/real-estate/agents/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Agent", id }],
    }),

    getAgentSlabHistory: builder.query<SingleResponse<AgentSlabHistory>, string>({
      query: (id) => `/real-estate/agents/${id}/slab-history`,
      providesTags: (_r, _e, id) => [{ type: "Agent", id }],
    }),

    createAgent: builder.mutation<
      SingleResponse<AgentProfile>,
      {
        userId: string;
        sponsorId?: string;
        sponsorCode?: string;
        parentId?: string;
        rankId?: string;
        licenseNumber?: string;
        licenseAuthority?: string;
        licenseIssuedAt?: string;
        licenseExpiresAt?: string;
        specializations?: string[];
        serviceAreas?: string[];
        bio?: string;
      }
    >({
      query: (body) => ({
        url: "/real-estate/agents",
        method: "POST",
        body,
      }),
      invalidatesTags: [
        { type: "Agents", id: "LIST" },
        { type: "AgentTree", id: "ALL" },
      ],
    }),

    updateAgent: builder.mutation<
      SingleResponse<AgentProfile>,
      { id: string; body: Partial<AgentProfile> & { promotionReason?: string } }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/agents/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Agent", id },
        { type: "Agents", id: "LIST" },
        { type: "AgentTree", id: "ALL" },
      ],
    }),

    deleteAgent: builder.mutation<SingleResponse<AgentProfile>, string>({
      query: (id) => ({
        url: `/real-estate/agents/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, id) => [
        { type: "Agent", id },
        { type: "Agents", id: "LIST" },
        { type: "AgentTree", id: "ALL" },
      ],
    }),

    // ─── Tree ───────────────────────────────────────────────────────────────
    getAgentTree: builder.query<{ success: boolean; data: AgentTreeNode[] }, string | void>({
      query: (rootId) => `/real-estate/agents/tree${rootId ? `?rootId=${rootId}` : ""}`,
      providesTags: [{ type: "AgentTree", id: "ALL" }],
    }),

    // ─── Ranks ──────────────────────────────────────────────────────────────
    getRanks: builder.query<{ success: boolean; data: Rank[] }, void>({
      query: () => "/real-estate/ranks",
      providesTags: [{ type: "Ranks", id: "LIST" }],
    }),

    createRank: builder.mutation<SingleResponse<Rank>, Partial<Rank>>({
      query: (body) => ({
        url: "/real-estate/ranks",
        method: "POST",
        body,
      }),
      invalidatesTags: [{ type: "Ranks", id: "LIST" }],
    }),

    updateRank: builder.mutation<
      SingleResponse<Rank>,
      { id: string; body: Partial<Rank> }
    >({
      query: ({ id, body }) => ({
        url: `/real-estate/ranks/${id}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: [{ type: "Ranks", id: "LIST" }],
    }),

    deleteRank: builder.mutation<{ success: boolean }, string>({
      query: (id) => ({
        url: `/real-estate/ranks/${id}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "Ranks", id: "LIST" }],
    }),
  }),
});

export const {
  useGetAgentsQuery,
  useGetAgentQuery,
  useGetAgentSlabHistoryQuery,
  useCreateAgentMutation,
  useUpdateAgentMutation,
  useDeleteAgentMutation,
  useGetAgentTreeQuery,
  useGetRanksQuery,
  useCreateRankMutation,
  useUpdateRankMutation,
  useDeleteRankMutation,
} = agentsApi;
