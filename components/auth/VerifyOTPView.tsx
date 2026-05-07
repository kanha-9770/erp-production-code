"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { VerifyOTPSchema } from "@/lib/utils/validations"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Loader2, ShieldCheck, ArrowLeft, RefreshCw, MailCheck } from "lucide-react"
import type { z } from "zod"
import { CreateOrganizationModal } from "@/components/users/create-organization-modal"
import { useVerifyOTPMutation, useResendOTPMutation, useGetUserByIdQuery } from "@/lib/api/auth"
import type { AuthViewProps } from "./types"
import { OtpInput } from "./OtpInput"

type VerifyOTPFormData = z.infer<typeof VerifyOTPSchema>

interface VerifyOTPViewProps extends AuthViewProps {
  userId?: string
  otpType?: string
}

export default function VerifyOTPView({
  userId,
  otpType = "registration",
  onSwitchView,
}: VerifyOTPViewProps) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [showOrgModal, setShowOrgModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const { toast } = useToast()

  const [verifyOTP, { isLoading: isVerifying }] = useVerifyOTPMutation()
  const [resendOTP, { isLoading: isResending }] = useResendOTPMutation()

  const { data: userByIdData } = useGetUserByIdQuery(userId!, { skip: !userId })
  const maskedEmail = (userByIdData as any)?.maskedEmail || null

  const form = useForm<VerifyOTPFormData>({
    resolver: zodResolver(VerifyOTPSchema),
    defaultValues: { otp: "" },
  })

  useEffect(() => {
    if (!userId) onSwitchView("register")
  }, [userId, onSwitchView])

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [timeLeft])

  const onSubmit = async (data: VerifyOTPFormData) => {
    if (!userId) return
    try {
      const result = await verifyOTP({ otp: data.otp, userId, type: otpType }).unwrap()
      toast({ title: "Verified", description: "Code accepted." })
      if (otpType === "registration" && result.needsOrganization) {
        setShowOrgModal(true)
      } else {
        setTimeout(() => {
          window.location.href = "/profile"
        }, 100)
      }
    } catch (error: any) {
      const message = error?.data?.error || "Invalid or expired code"
      setErrorMessage(message)
      toast({ title: "Verification failed", description: message, variant: "destructive" })
    }
  }

  const handleResendOTP = async () => {
    if (!userId || timeLeft > 0 || isResending) return
    form.setValue("otp", "")
    setErrorMessage("")
    try {
      const result = await resendOTP({ userId, type: otpType.toLowerCase() }).unwrap()
      const msg = result.message || `New code sent to ${maskedEmail || "your email"}`
      setInfoMessage(msg)
      toast({ title: "Code sent", description: msg })
      setTimeLeft(60)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.data?.error || "Failed to resend code",
        variant: "destructive",
      })
    }
  }

  const handleOrganizationCreated = () => {
    setShowOrgModal(false)
    setTimeout(() => {
      window.location.href = "/profile"
    }, 100)
  }

  const otpValue = form.watch("otp")

  if (!userId) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">Invalid verification request.</p>
        <Button onClick={() => onSwitchView("register")}>Back to registration</Button>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary">
            <MailCheck className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Check your inbox
            </h1>
            <p className="text-sm text-muted-foreground">
              We sent a 6-digit code{" "}
              {maskedEmail ? (
                <>
                  to <span className="font-medium text-foreground">{maskedEmail}</span>
                </>
              ) : (
                "to your email"
              )}
              . It expires in 10 minutes.
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
                  <FormControl>
                    <OtpInput
                      value={field.value ?? ""}
                      onChange={(v) => {
                        if (errorMessage) setErrorMessage("")
                        field.onChange(v)
                      }}
                      onComplete={(code) => {
                        field.onChange(code)
                        // Auto-submit on full code; better mobile UX.
                        form.handleSubmit(onSubmit)()
                      }}
                      disabled={isVerifying}
                      invalid={!!errorMessage}
                    />
                  </FormControl>
                  <FormMessage className="text-center" />
                  {errorMessage && (
                    <p className="text-center text-xs text-destructive font-medium pt-1">
                      {errorMessage}
                    </p>
                  )}
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="w-full h-11 font-medium"
              disabled={isVerifying || otpValue.length !== 6}
            >
              {isVerifying ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Verify code
                </>
              )}
            </Button>
          </form>
        </Form>

        <div className="space-y-3 text-center">
          <button
            onClick={handleResendOTP}
            disabled={timeLeft > 0 || isResending}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            {isResending ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Resending…
              </>
            ) : timeLeft > 0 ? (
              `Resend in ${timeLeft}s`
            ) : (
              <>
                <RefreshCw className="h-3 w-3" />
                Resend code
              </>
            )}
          </button>

          {infoMessage && (
            <p className="text-xs text-emerald-600 dark:text-emerald-400">{infoMessage}</p>
          )}

          <button
            type="button"
            onClick={() => onSwitchView(otpType === "login" ? "login" : "register")}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3" />
            {otpType === "login" ? "Back to sign in" : "Back to registration"}
          </button>
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Didn&apos;t receive it? Check spam, or try a different email.
        </p>
      </div>

      <CreateOrganizationModal open={showOrgModal} onSuccess={handleOrganizationCreated} />
    </>
  )
}
