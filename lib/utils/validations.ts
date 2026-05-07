import { z } from "zod"
import { checkPassword } from "@/lib/auth/password-policy"

// Reusable strong-password schema. Surfaces the first failing rule as the
// zod error message so RHF can display it inline.
const StrongPassword = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(128, "Password is too long")
  .superRefine((val, ctx) => {
    const r = checkPassword(val)
    if (!r.ok) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: r.errors[0] ?? "Password does not meet the policy",
      })
    }
  })

export const RegisterSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: StrongPassword,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  // Password optional because the form supports passwordless OTP login.
  password: z.string().optional(),
})

export const VerifyOTPSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
})

export const ResetPasswordSchema = z
  .object({
    email: z.string().email("Invalid email address"),
    otp: z.string().length(6, "OTP must be 6 digits"),
    password: StrongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: StrongPassword,
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "New password must differ from the current one",
    path: ["newPassword"],
  })

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
})
