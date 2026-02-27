import { z } from "zod"

export const RegisterSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

export const LoginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().optional(),
})

export const VerifyOTPSchema = z.object({
  otp: z.string().length(6, "OTP must be 6 digits"),
})

export const CreateOrganizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
})
