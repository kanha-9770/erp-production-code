import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export interface Module {
  module_id: string
  module_name: string
  description?: string
  icon?: string
  color?: string
  path?: string
  parent_id?: string
  level: number
  sort_order: number
  module_type: string
}

export interface User {
  id: string
  email: string
  name: string
}

export interface ModulesResponse {
  success: boolean
  modules: Module[]
}

export interface UserResponse {
  user: User
}

export const apiSlice = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api",
    credentials: "include", // Include cookies for authentication
  }),
  tagTypes: ["Modules", "User"],
  endpoints: (builder) => ({
    // Get permitted modules with automatic caching
    getPermittedModules: builder.query<ModulesResponse, void>({
      query: () => "/user/permitted-modules",
      providesTags: ["Modules"],
      // Keep cached data for 5 minutes
      keepUnusedDataFor: 300,
    }),
    // Get current user with automatic caching
    getCurrentUser: builder.query<UserResponse, void>({
      query: () => "/auth/me",
      providesTags: ["User"],
      // Keep cached data for 10 minutes
      keepUnusedDataFor: 600,
    }),
  }),
})
export const { useGetPermittedModulesQuery, useGetCurrentUserQuery } = apiSlice
