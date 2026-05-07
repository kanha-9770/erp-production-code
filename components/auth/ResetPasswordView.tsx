"use client"

import { useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Loader2, KeyRound, ArrowLeft } from "lucide-react"
import type { AuthViewProps } from "./types"
import { useResetPasswordMutation } from "@/lib/api/auth"
import { OtpInput } from "./OtpInput"
import { PasswordInput } from "./PasswordInput"
import { checkPassword } from "@/lib/auth/password-policy"

const ResetPasswordSchema = z
  .object({
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
    password: z
      .string()
      .min(10, "Use at least 10 characters")
      .superRefine((val, ctx) => {
        const r = checkPassword(val)
        if (!r.ok) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: r.errors[0] ?? "Password does not meet the policy",
          })
        }
      }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type ResetPasswordFormData = z.infer<typeof ResetPasswordSchema>

interface ResetPasswordViewProps extends AuthViewProps {
  userId?: string
  email?: string
}

export default function ResetPasswordView({
  userId,
  email,
  onSwitchView,
}: ResetPasswordViewProps) {
  const { toast } = useToast()
  const [resetPassword, { isLoading }] = useResetPasswordMutation()

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { otp: "", password: "", confirmPassword: "" },
    mode: "onBlur",
  })

  const otpValue = form.watch("otp")

  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!userId) {
      toast({ title: "Error", description: "Invalid reset request", variant: "destructive" })
      return
    }
    try {
      await resetPassword({ ...data, userId }).unwrap()
      toast({
        title: "Password reset",
        description: "You're now signed in.",
      })
      window.location.href = "/profile"
    } catch (error: any) {
      const errorMessage =
        error?.data?.error || error?.data?.message || "Something went wrong"
      const m = errorMessage.toLowerCase()
      if (m.includes("otp") || m.includes("code") || m.includes("invalid")) {
        toast({
          title: "Invalid code",
          description: "The code is incorrect or expired. Try again.",
          variant: "destructive",
        })
        form.setError("otp", { message: "Invalid or expired OTP" })
      } else if (error?.status === "FETCH_ERROR") {
        toast({
          title: "Network error",
          description: "Check your connection and try again.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Reset failed", description: errorMessage, variant: "destructive" })
      }
    }
  }

  useEffect(() => {
    if (!userId) onSwitchView("forgot-password")
  }, [userId, onSwitchView])

  if (!userId) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">Invalid reset request.</p>
        <Button onClick={() => onSwitchView("forgot-password")}>Request reset</Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Set a new password
          </h1>
          <p className="text-sm text-muted-foreground">
            Enter the code we sent
            {email ? (
              <>
                {" "}
                to <span className="font-medium text-foreground">{email}</span>
              </>
            ) : (
              " to your email"
            )}{" "}
            and choose a new password.
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <FormField
            control={form.control}
            name="otp"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Reset code
                </FormLabel>
                <FormControl>
                  <OtpInput
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    disabled={isLoading}
                    invalid={!!form.formState.errors.otp}
                  />
                </FormControl>
                <FormMessage className="text-center" />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  New password
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    placeholder="At least 10 characters"
                    autoComplete="new-password"
                    disabled={isLoading}
                    withMeter
                    withChecklist
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirm password
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    placeholder="Re-enter your new password"
                    autoComplete="new-password"
                    disabled={isLoading}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full h-11 font-medium"
            disabled={isLoading || otpValue.length !== 6}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Resetting…
              </>
            ) : (
              "Reset password"
            )}
          </Button>
        </form>
      </Form>

      <div className="text-center">
        <button
          type="button"
          onClick={() => onSwitchView("forgot-password")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back
        </button>
      </div>
    </div>
  )
}
