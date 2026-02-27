import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

// Type definitions for request/response
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
      role: { id: string; name: string }
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

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: fetchBaseQuery({
    baseUrl: "/api/auth",
    credentials: "include",
  }),
  tagTypes: ["User", "Auth"],
  endpoints: (builder) => ({
    // Register endpoint
    register: builder.mutation<RegisterResponse, RegisterRequest>({
      query: (body) => ({
        url: "/register",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
    }),

    // Login endpoint
    login: builder.mutation<LoginResponse, LoginRequest>({
      query: (body) => ({
        url: "/login",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth"],
    }),

    // Verify OTP endpoint
    verifyOTP: builder.mutation<VerifyOTPResponse, VerifyOTPRequest>({
      query: (body) => ({
        url: "/verify-otp",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth", "User"],
    }),

    // Resend OTP endpoint
    resendOTP: builder.mutation<ResendOTPResponse, ResendOTPRequest>({
      query: (body) => ({
        url: "/resend-otp",
        method: "POST",
        body,
      }),
    }),

    // Reset password endpoint
    resetPassword: builder.mutation<ResetPasswordResponse, ResetPasswordRequest>({
      query: (body) => ({
        url: "/reset-password",
        method: "POST",
        body,
      }),
      invalidatesTags: ["Auth", "User"],
    }),

    // Get current user
    getUser: builder.query<GetUserResponse, void>({
      query: () => "/me",
      providesTags: ["User"],
    }),

    // Logout endpoint
    logout: builder.mutation<LogoutResponse, void>({
      query: () => ({
        url: "/logout",
        method: "POST",
      }),
      invalidatesTags: ["Auth", "User"],
    }),
  }),
})

// Export hooks for components
export const {
  useRegisterMutation,
  useLoginMutation,
  useVerifyOTPMutation,
  useResendOTPMutation,
  useResetPasswordMutation,
  useGetUserQuery,
  useLogoutMutation,
} = authApi
