"use client"

import type React from "react"
import { useState, useRef, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { VerifyOTPSchema } from "@/lib/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Shield, ArrowLeft, RefreshCw } from "lucide-react"
import type { z } from "zod"
import { CreateOrganizationModal } from "@/components/create-organization-modal"
import { useVerifyOTPMutation, useResendOTPMutation, useGetUserByIdQuery } from "@/lib/api/auth"
import type { AuthViewProps } from "./types"

type VerifyOTPFormData = z.infer<typeof VerifyOTPSchema>

interface VerifyOTPViewProps extends AuthViewProps {
  userId?: string
  otpType?: string
}

export default function VerifyOTPView({ userId, otpType = "registration", onSwitchView }: VerifyOTPViewProps) {
  const [timeLeft, setTimeLeft] = useState(0)
  const [showOrgModal, setShowOrgModal] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [infoMessage, setInfoMessage] = useState("")
  const { toast } = useToast()
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  const [verifyOTP, { isLoading: isVerifying }] = useVerifyOTPMutation()
  const [resendOTP, { isLoading: isResending }] = useResendOTPMutation()

  // Fetch masked email via RTK Query (skip if no userId)
  const { data: userByIdData } = useGetUserByIdQuery(userId!, { skip: !userId })
  const maskedEmail = (userByIdData as any)?.maskedEmail || null

  const form = useForm<VerifyOTPFormData>({
    resolver: zodResolver(VerifyOTPSchema),
    defaultValues: { otp: "" },
  })

  useEffect(() => {
    if (!userId) {
      onSwitchView("register")
    }
  }, [userId, onSwitchView])

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000)
      return () => clearTimeout(timer)
    }
  }, [timeLeft])

  const handleOTPChange = (index: number, value: string) => {
    if (value.length > 1) return
    if (errorMessage) setErrorMessage("")
    const newOTP = form.getValues("otp").split("")
    newOTP[index] = value
    form.setValue("otp", newOTP.join(""))
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !e.currentTarget.value && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    try {
      const paste = e.clipboardData.getData("text") || ""
      const digits = paste.replace(/\D/g, "").split("").slice(0, 6 - index)
      if (!digits.length) return

      const currentOTP = form.getValues("otp").split("").slice(0, 6)
      while (currentOTP.length < 6) currentOTP.push("")
      for (let i = 0; i < digits.length; i++) currentOTP[index + i] = digits[i]

      form.setValue("otp", currentOTP.join("").slice(0, 6))
      const lastFilled = Math.min(5, index + digits.length - 1)
      setTimeout(() => inputRefs.current[lastFilled]?.focus(), 0)
      if (errorMessage) setErrorMessage("")
    } catch {
      // ignore paste errors
    }
  }

  const onSubmit = async (data: VerifyOTPFormData) => {
    if (!userId) return
    try {
      const result = await verifyOTP({ otp: data.otp, userId, type: otpType }).unwrap()
      toast({ title: "Success!", description: "Email verified successfully" })

      if (otpType === "registration" && result.needsOrganization) {
        setShowOrgModal(true)
      } else {
        setTimeout(() => { window.location.href = "/profile" }, 100)
      }
    } catch (error: any) {
      const message = error?.data?.error || "OTP is invalid or wrong OTP"
      setErrorMessage(message)
      toast({ title: "Verification Failed", description: message, variant: "destructive" })
    }
  }

  const handleResendOTP = async () => {
    if (!userId || timeLeft > 0 || isResending) return
    try { form.setValue("otp", "") } catch { /* ignore */ }
    setErrorMessage("")
    setTimeout(() => inputRefs.current[0]?.focus(), 0)

    try {
      const result = await resendOTP({ userId, type: otpType.toLowerCase() }).unwrap()
      const msg = result.message || `A new verification code has been sent to ${maskedEmail || "your email"}`
      setInfoMessage(msg)
      toast({ title: "Code Sent", description: msg })
      setTimeLeft(60)
    } catch (error: any) {
      toast({ title: "Error", description: error?.data?.error || "Failed to resend code", variant: "destructive" })
    }
  }

  const handleOrganizationCreated = () => {
    setShowOrgModal(false)
    setTimeout(() => { window.location.href = "/profile" }, 100)
  }

  const otpValue = form.watch("otp")

  if (!userId) {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 mb-4">Invalid verification request</p>
            <Button onClick={() => onSwitchView("register")}>Back to Registration</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 flex items-center justify-center bg-green-600 rounded-full mb-4">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Verify Your Email</h1>
          <p className="mt-2 text-gray-600">Enter the 6-digit code sent to your email address</p>
          {maskedEmail && (
            <p className="mt-1 text-sm text-gray-500">Code sent to {maskedEmail}</p>
          )}
        </div>

        {errorMessage && (
          <p className="text-center text-red-600 font-medium mb-2">{errorMessage}</p>
        )}

        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-semibold">Enter Verification Code</CardTitle>
            <CardDescription>The code will expire in 10 minutes for security</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="otp"
                  render={() => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium">Verification Code</FormLabel>
                      <FormControl>
                        <div className="flex justify-center space-x-3">
                          {[0, 1, 2, 3, 4, 5].map((index) => (
                            <Input
                              key={index}
                              ref={(el) => { inputRefs.current[index] = el }}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              maxLength={1}
                              className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                              value={otpValue[index] || ""}
                              onChange={(e) => handleOTPChange(index, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(index, e)}
                              onPaste={(e) => handlePaste(index, e)}
                              disabled={isVerifying}
                            />
                          ))}
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-200 hover:scale-[1.02]"
                  disabled={isVerifying || otpValue.length !== 6}
                >
                  {isVerifying ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Verifying...</span>
                    </div>
                  ) : (
                    "Verify Email"
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center space-y-3">
              <button
                onClick={handleResendOTP}
                disabled={timeLeft > 0 || isResending}
                className="text-sm text-blue-600 hover:text-blue-500 font-medium disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {isResending ? (
                  <div className="flex items-center space-x-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Resending...</span>
                  </div>
                ) : timeLeft > 0 ? (
                  `Resend code in ${timeLeft}s`
                ) : (
                  <div className="flex items-center space-x-1">
                    <RefreshCw className="h-3 w-3" />
                    <span>Resend verification code</span>
                  </div>
                )}
              </button>

              {infoMessage && (
                <p className="text-sm text-green-600 mt-1">{infoMessage}</p>
              )}

              <div>
                <button
                  type="button"
                  onClick={() => onSwitchView("register")}
                  className="inline-flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-500 transition-colors"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span>Back to registration</span>
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            Didn&apos;t receive the code? Check your spam folder or try resending.
          </p>
        </div>
      </div>

      <CreateOrganizationModal open={showOrgModal} onSuccess={handleOrganizationCreated} />
    </>
  )
}
