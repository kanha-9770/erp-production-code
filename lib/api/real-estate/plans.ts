import { baseApi } from "@/lib/api/baseApi";

export interface CompPlanSlab {
  id: string;
  sortOrder: number;
  minArea: number;
  maxArea: number | null;
  ratePerUnit: number;
}

export interface CompPlanOverrideLevel {
  id: string;
  level: number;
  factor: number;
}

export interface CompPlanDesignation {
  id: string;
  sortOrder: number;
  minCumulativeArea: number;
  designationCode: string;
  designationName: string;
  rewardType: "TRAVEL" | "CASH" | "NONE" | "SURPRISE";
  rewardDescription: string | null;
  rewardCashAmount: number | null;
}

export interface CompPlanGuarantee {
  id: string;
  designationCode: string;
  monthlyAmount: number;
  currency: string;
}

export interface CompPlan {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  version: number;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  areaUnit: string;
  companyResidualPercent: number;
  compressionEnabled: boolean;
  overrideMode: "DIFF_RATE" | "DIFF_FACTOR";
  slabCounterScope: "LIFETIME" | "ANNUAL";
  slabs: CompPlanSlab[];
  overrideLevels: CompPlanOverrideLevel[];
  designations: CompPlanDesignation[];
  guarantees: CompPlanGuarantee[];
  activatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SimulateInput {
  dealArea: number;
  sellerCumulativeAreaBefore: number;
  uplineAreas?: number[];
}

export interface SimulateOutput {
  sellerRate: number;
  directIncome: number;
  overrides: Array<{ level: number; rate: number; factor: number; amount: number }>;
  overrideTotal: number;
  brokerageAmount: number;
  total: number;
}

const plansApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getPlans: build.query<{ data: CompPlan[] }, { status?: string } | void>({
      query: (args) => {
        const params = args?.status ? `?status=${args.status}` : "";
        return `/real-estate/plans${params}`;
      },
      providesTags: ["CompPlans"],
    }),

    getPlan: build.query<{ data: CompPlan }, string>({
      query: (id) => `/real-estate/plans/${id}`,
      providesTags: (_r, _e, id) => [{ type: "CompPlans", id }],
    }),

    createPlan: build.mutation<{ data: CompPlan }, Partial<CompPlan>>({
      query: (body) => ({ url: "/real-estate/plans", method: "POST", body }),
      invalidatesTags: ["CompPlans"],
    }),

    updatePlan: build.mutation<{ data: CompPlan }, { id: string } & Partial<CompPlan>>({
      query: ({ id, ...body }) => ({ url: `/real-estate/plans/${id}`, method: "PUT", body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "CompPlans", id }, "CompPlans"],
    }),

    activatePlan: build.mutation<{ data: CompPlan }, string>({
      query: (id) => ({ url: `/real-estate/plans/${id}/activate`, method: "POST" }),
      invalidatesTags: ["CompPlans", "RebmSettings"],
    }),

    deactivatePlan: build.mutation<{ data: { id: string; status: string } }, string>({
      query: (id) => ({ url: `/real-estate/plans/${id}/activate`, method: "DELETE" }),
      invalidatesTags: ["CompPlans", "RebmSettings"],
    }),

    deletePlan: build.mutation<{ data: { deleted: boolean } }, string>({
      query: (id) => ({ url: `/real-estate/plans/${id}`, method: "DELETE" }),
      invalidatesTags: ["CompPlans"],
    }),

    simulatePlan: build.mutation<{ data: SimulateOutput }, { id: string } & SimulateInput & { uplineAreas?: number[] }>({
      query: ({ id, ...body }) => ({ url: `/real-estate/plans/${id}/simulate`, method: "POST", body }),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetPlansQuery,
  useGetPlanQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  useActivatePlanMutation,
  useDeactivatePlanMutation,
  useDeletePlanMutation,
  useSimulatePlanMutation,
} = plansApi;
