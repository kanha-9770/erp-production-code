import { baseApi } from "@/lib/api/baseApi";

export interface RebmSettings {
  id: string;
  organizationId: string;
  isReraRequired: boolean;
  planEngine: "LEGACY" | "SLAB";
  activePlanId: string | null;
  areaUnit: string;
  holdPeriodDays: number;
  companyResidualPercent: number;
  updatedAt: string;
}

export interface AgentReraProfile {
  id: string;
  agentId: string;
  reraNumber: string | null;
  reraState: string | null;
  reraExpiresAt: string | null;
  reraVerifiedAt: string | null;
  reraVerifiedBy: string | null;
  reraDocUrl: string | null;
}

const settingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getRebmSettings: build.query<{ data: RebmSettings }, void>({
      query: () => "/real-estate/settings",
      providesTags: ["RebmSettings"],
    }),

    updateRebmSettings: build.mutation<{ data: RebmSettings }, Partial<RebmSettings>>({
      query: (body) => ({ url: "/real-estate/settings", method: "PATCH", body }),
      invalidatesTags: ["RebmSettings"],
    }),

    getAgentRera: build.query<{ data: AgentReraProfile | null }, string>({
      query: (agentId) => `/real-estate/settings/rera/${agentId}`,
      providesTags: (_r, _e, agentId) => [{ type: "AgentRera", id: agentId }],
    }),

    upsertAgentRera: build.mutation<{ data: AgentReraProfile }, { agentId: string } & Partial<AgentReraProfile>>({
      query: ({ agentId, ...body }) => ({
        url: `/real-estate/settings/rera/${agentId}`,
        method: "PUT",
        body,
      }),
      invalidatesTags: (_r, _e, { agentId }) => [{ type: "AgentRera", id: agentId }],
    }),

    verifyAgentRera: build.mutation<{ data: AgentReraProfile }, string>({
      query: (agentId) => ({
        url: `/real-estate/settings/rera/${agentId}/verify`,
        method: "POST",
      }),
      invalidatesTags: (_r, _e, agentId) => [{ type: "AgentRera", id: agentId }],
    }),

    rejectAgentRera: build.mutation<{ data: AgentReraProfile }, string>({
      query: (agentId) => ({
        url: `/real-estate/settings/rera/${agentId}/verify`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, agentId) => [{ type: "AgentRera", id: agentId }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetRebmSettingsQuery,
  useUpdateRebmSettingsMutation,
  useGetAgentReraQuery,
  useUpsertAgentReraMutation,
  useVerifyAgentReraMutation,
  useRejectAgentReraMutation,
} = settingsApi;
