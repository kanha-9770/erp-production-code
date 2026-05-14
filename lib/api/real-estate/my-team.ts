import { baseApi } from "@/lib/api/baseApi";

export interface TeamMember {
  id: string;
  userId: string;
  user: { id: string; name: string | null; email: string; image?: string | null };
  status: string;
  rank: { name: string; code: string } | null;
  reraVerified: boolean;
  joinedAt: string;
  cumulativeArea?: number;
  depth?: number;
  parentId?: string | null;
}

export interface MyTeamData {
  agent: {
    id: string;
    userId: string;
    sponsorCode: string | null;
    status: string;
    rank: { name: string; code: string; level: number } | null;
    reraProfile: {
      reraNumber: string | null;
      reraState: string | null;
      reraVerifiedAt: string | null;
      reraExpiresAt: string | null;
    } | null;
    joinedAt: string;
    designation: { code: string; name: string } | null;
    cumulativeArea: number;
  };
  directDownline: TeamMember[];
  stats: {
    totalDownline: number;
    directCount: number;
    activeCount: number;
    pendingCount: number;
  };
  pendingInvites: InviteToken[];
}

export interface InviteToken {
  id: string;
  token: string;
  expiresAt: string;
  status: string;
  prefillName: string | null;
  prefillEmail: string | null;
  prefillPhone: string | null;
  createdAt: string;
}

const myTeamApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getMyTeam: build.query<{ data: MyTeamData }, void>({
      query: () => "/real-estate/my-team",
      providesTags: ["MyTeam"],
    }),

    getMyDownline: build.query<{ data: TeamMember[] }, { depth?: number } | void>({
      query: (args) => {
        const d = args?.depth ?? 3;
        return `/real-estate/my-team/downline?depth=${d}`;
      },
      providesTags: ["MyTeam"],
    }),

    createInvite: build.mutation<
      { data: InviteToken },
      {
        expiryDays?: number;
        prefillName?: string;
        prefillEmail?: string;
        prefillPhone?: string;
        parentAgentId?: string;
      }
    >({
      query: (body) => ({ url: "/real-estate/my-team/invite", method: "POST", body }),
      invalidatesTags: ["MyTeam"],
    }),

    cancelInvite: build.mutation<{ data: { cancelled: boolean } }, string>({
      query: (id) => ({ url: `/real-estate/my-team/invite/${id}`, method: "DELETE" }),
      invalidatesTags: ["MyTeam"],
    }),

    lookupInvite: build.query<
      {
        data: {
          token: string;
          expiresAt: string;
          prefillName: string | null;
          prefillEmail: string | null;
          prefillPhone: string | null;
          sponsor: { name: string | null; email: string; image: string | null; rank: string | null };
        };
      },
      string
    >({
      query: (token) => `/real-estate/join/${token}`,
    }),

    redeemInvite: build.mutation<{ data: { id: string; status: string } }, string>({
      query: (token) => ({ url: `/real-estate/join/${token}/redeem`, method: "POST" }),
      invalidatesTags: ["MyTeam"],
    }),

    runGuarantee: build.mutation<{ data: { processed: number; skipped: number } }, { year: number; month: number }>({
      query: (body) => ({ url: "/real-estate/guarantee/run", method: "POST", body }),
    }),

    lookupReferral: build.query<
      {
        data: {
          kind: "invite" | "sponsor";
          sponsor: {
            id: string;
            name: string | null;
            email: string;
            image: string | null;
            rank: string | null;
            organizationName: string | null;
          };
          expiresAt?: string;
        };
      },
      string
    >({
      query: (code) => `/real-estate/referral-lookup?code=${encodeURIComponent(code)}`,
    }),

    onboardAsAgent: build.mutation<
      { data: { id: string; status: string }; alreadyExists?: boolean },
      { referralCode: string }
    >({
      query: (body) => ({
        url: "/real-estate/onboard-as-agent",
        method: "POST",
        body,
      }),
      invalidatesTags: ["MyTeam"],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetMyTeamQuery,
  useGetMyDownlineQuery,
  useCreateInviteMutation,
  useCancelInviteMutation,
  useLookupInviteQuery,
  useRedeemInviteMutation,
  useRunGuaranteeMutation,
  useLookupReferralQuery,
  useOnboardAsAgentMutation,
} = myTeamApi;
