import { baseApi } from "./baseApi";
// Re-use the server-side shapes so client + server never drift.
import type {
  ScopedRoleHierarchy,
  ScopedHierarchyChain,
  HierarchyNode,
  HierarchyUser,
} from "@/lib/database/roles";

export type {
  ScopedRoleHierarchy,
  ScopedHierarchyChain,
  HierarchyNode,
  HierarchyUser,
};

interface MyHierarchyResponse {
  success: boolean;
  data: ScopedRoleHierarchy;
}

export const hierarchyApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // The caller's own reporting line (who they report to + who reports to
    // them). Tagged with the role tags so re-parenting a role or moving a
    // user between roles in /settings/company refreshes this view.
    getMyHierarchy: builder.query<MyHierarchyResponse, void>({
      query: () => "/profile/hierarchy",
      providesTags: ["Roles", "OrgRoles", "AdminUsers"],
      keepUnusedDataFor: 120,
    }),
  }),
});

export const { useGetMyHierarchyQuery } = hierarchyApi;
