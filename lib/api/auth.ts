import { baseApi } from "./baseApi"

// ─── Type definitions ────────────────────────────────────────────────────────

export interface RegisterRequest {
  name: string
  email: string
  password: string
  confirmPassword: string
}

export interface RegisterResponse {
  success: boolean
  message: string
  userId: string
}

export interface LoginRequest {
  email: string
  password?: string
}

export interface LoginResponse {
  success: boolean
  message: string
  userId?: string
  requiresOTP?: boolean
  user?: {
    id: string
    email: string
    email_verified: boolean
  }
}

export interface VerifyOTPRequest {
  otp: string
  userId: string
  type: string
}

export interface VerifyOTPResponse {
  success: boolean
  message: string
  needsOrganization?: boolean
  user: {
    id: string
    email: string
    email_verified: boolean
  }
}

export interface ResendOTPRequest {
  userId: string
  type: string
}

export interface ResendOTPResponse {
  success: boolean
  message: string
}

export interface ResetPasswordRequest {
  userId: string
  otp: string
  password: string
  confirmPassword: string
}

export interface ResetPasswordResponse {
  success: boolean
  message: string
  user: {
    id: string
    email: string
    email_verified: boolean
  }
}

export interface GetUserResponse {
  success: boolean
  user: {
    id: string
    email: string
    username?: string
    first_name?: string
    last_name?: string
    email_verified: boolean
    status: string
    createdAt: string
    isAdmin: boolean
    isOrgOwner?: boolean
    allowedRoutes?: string[]
    deniedRoutes?: string[]
    mobile?: string
    mobile_verified?: boolean
    avatar?: string
    department?: string
    phone?: string
    location?: string
    joinDate?: string
    organization?: {
      id: string
      name: string
    }
    unitAssignments?: Array<{
      unit: { id: string; name: string }
      role: { id: string; name: string; isAdmin?: boolean }
      notes?: string
    }>
    employee?: {
      employeeName: string
      gender?: string
      department?: string
      designation?: string
      dob?: string
      nativePlace?: string
      country?: string
      permanentAddress?: string
      currentAddress?: string
      personalContact?: string
      alternateNo1?: string
      alternateNo2?: string
      emailAddress1?: string
      emailAddress2?: string
      aadharCardNo?: string
      bankName?: string
      bankAccountNo?: string
      ifscCode?: string
      status?: string
      shiftType?: string
      inTime?: string
      outTime?: string
      dateOfJoining?: string
      dateOfLeaving?: string
      incrementMonth?: string
      yearsOfAgreement?: string
      bonusAfterYears?: string
      companyName?: string
      employeeEngagementTeamName?: string
      totalSalary?: number
      givenSalary?: number
      bonusAmount?: number
      nightAllowance?: number
      overTime?: number
      oneHourExtra?: number
      companySimIssue?: string
    }
  }
}

export interface LogoutResponse {
  success: boolean
  message: string
}

export interface CurrentUserResponse {
  success: boolean
  user: {
    id: string
    username: string
    first_name: string | null
    last_name: string | null
    email: string
  } | null
}

// ─── Inject auth endpoints into the base API ─────────────────────────────────

export const authApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    register: builder.mutation<RegisterResponse, RegisterRequest>({
      query: (body) => ({
        url: "/auth/register",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
    }),

    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/auth/login",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
    }),

    verifyOTP: builder.mutation<VerifyOTPResponse, VerifyOTPRequest>({
      query: (body) => ({
        url: "/auth/verify-otp",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth", "User"],
    }),

    resendOTP: builder.mutation<ResendOTPResponse, ResendOTPRequest>({
      query: (body) => ({
        url: "/auth/resend-otp",
        method: "POST",
        body,
      }),
    }),

    resetPassword: builder.mutation<ResetPasswordResponse, ResetPasswordRequest>({
      query: (body) => ({
        url: "/auth/reset-password",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth", "User"],
    }),

    getUser: builder.query<GetUserResponse, void>({
      query: () => "/auth/me",
      providesTags: ["User"],
    }),

    getCurrentUser: builder.query<CurrentUserResponse, void>({
      query: () => "/user",
      providesTags: ["User"],
      keepUnusedDataFor: 600,
    }),

    logout: builder.mutation<LogoutResponse, void>({
      query: () => ({
        url: "/auth/logout",
        method: "POST",
      }),
      invalidatesTags: ["Auth", "User"],
    }),

    // Forgot password
    forgotPassword: builder.mutation<{ success: boolean; message: string }, { email: string }>({
      query: (body) => ({
        url: "/auth/forgot-password",
        method: "POST",
        body,
      }),
    }),

    // Change password (authenticated)
    changePassword: builder.mutation<{ success: boolean; message: string }, { currentPassword: string; newPassword: string; confirmPassword: string }>({
      query: (body) => ({
        url: "/auth/change-password",
        method: "POST",
        body,
      }),
    }),

    // Toggle 2FA
    toggle2FA: builder.mutation<{ success: boolean; message: string }, { enabled: boolean }>({
      query: (body) => ({
        url: "/auth/toggle-2fa",
        method: "POST",
        body,
      }),
      invalidatesTags: ["User"],
    }),

    // Get active sessions
    getSessions: builder.query<{ success: boolean; sessions: any[] }, void>({
      query: () => "/auth/sessions",
    }),

    // Delete a session
    deleteSession: builder.mutation<{ success: boolean }, string>({
      query: (sessionId) => ({
        url: `/auth/sessions/${sessionId}`,
        method: "DELETE",
      }),
    }),

    // Upload avatar (FormData)
    uploadAvatar: builder.mutation<{ success: boolean; url: string }, FormData>({
      query: (formData) => ({
        url: "/auth/upload-avatar",
        method: "POST",
        body: formData,
      }),
      // Avatar/name/contact are shared with the linked employee + user-mgmt
      // list, so a self-edit must refresh those screens too, not just "User".
      // "Employee" (the per-id tag, no id) invalidates every cached employee
      // DETAIL/preview query too — so an open Employee Master preview pane
      // refreshes on a profile edit, not just the list.
      invalidatesTags: ["User", "Employee", { type: "Employees", id: "LIST" }, "AdminUsers"],
    }),

    // Remove avatar
    removeAvatar: builder.mutation<{ success: boolean }, void>({
      query: () => ({
        url: "/auth/remove-avatar",
        method: "POST",
      }),
      // "Employee" (the per-id tag, no id) invalidates every cached employee
      // DETAIL/preview query too — so an open Employee Master preview pane
      // refreshes on a profile edit, not just the list.
      invalidatesTags: ["User", "Employee", { type: "Employees", id: "LIST" }, "AdminUsers"],
    }),

    // Update profile
    updateProfile: builder.mutation<{ success: boolean }, Record<string, any>>({
      query: (body) => ({
        url: "/auth/update-profile",
        method: "POST",
        body,
      }),
      // "Employee" (the per-id tag, no id) invalidates every cached employee
      // DETAIL/preview query too — so an open Employee Master preview pane
      // refreshes on a profile edit, not just the list.
      invalidatesTags: ["User", "Employee", { type: "Employees", id: "LIST" }, "AdminUsers"],
    }),

    // Get user by ID (for OTP verification flow)
    getUserById: builder.query<{ success: boolean; user: any }, string>({
      query: (userId) => `/auth/user?userId=${userId}`,
    }),
  }),
})

export const {
  useRegisterMutation,
  useLoginMutation,
  useVerifyOTPMutation,
  useResendOTPMutation,
  useResetPasswordMutation,
  useGetUserQuery,
  useGetCurrentUserQuery,
  useLogoutMutation,
  useForgotPasswordMutation,
  useChangePasswordMutation,
  useToggle2FAMutation,
  useGetSessionsQuery,
  useDeleteSessionMutation,
  useUploadAvatarMutation,
  useRemoveAvatarMutation,
  useUpdateProfileMutation,
  useGetUserByIdQuery,
} = authApi
