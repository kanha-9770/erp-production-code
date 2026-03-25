"use client"

import { useState, useRef, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { Loader2, Eye, EyeOff, KeyRound, ArrowLeft } from "lucide-react"
import type { AuthViewProps } from "./types"
import { useResetPasswordMutation } from "@/lib/api/auth"

const ResetPasswordSchema = z
  .object({
    otp: z.string().length(6, "OTP must be exactly 6 digits"),
    password: z.string().min(8, "Password must be at least 8 characters long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  })

type ResetPasswordFormData = z.infer<typeof ResetPasswordSchema>

interface ResetPasswordViewProps extends AuthViewProps {
  userId?: string
  email?: string          // Email to which OTP was sent
}

export default function ResetPasswordView({
  userId,
  email,
  onSwitchView,
}: ResetPasswordViewProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { toast } = useToast()

  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const [resetPassword, { isLoading }] = useResetPasswordMutation()

  const form = useForm<ResetPasswordFormData>({
    resolver: zodResolver(ResetPasswordSchema),
    defaultValues: { otp: "", password: "", confirmPassword: "" },
    mode: "onBlur", // Show validation errors on blur for better UX
  })

  const otpValue = form.watch("otp")

  // ==================== OTP Paste Handling ====================
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pastedText = e.clipboardData.getData("text").trim().replace(/\s+/g, "")

    if (/^\d{6}$/.test(pastedText)) {
      form.setValue("otp", pastedText, { shouldValidate: true })

      // Fill all input boxes visually
      pastedText.split("").forEach((digit, index) => {
        if (inputRefs.current[index]) {
          inputRefs.current[index]!.value = digit
        }
      })

      inputRefs.current[5]?.focus()

      toast({
        title: "OTP Pasted",
        description: "6-digit code filled successfully",
      })
    } else {
      toast({
        title: "Invalid Format",
        description: "Please paste a valid 6-digit code",
        variant: "destructive",
      })
    }
  }

  // ==================== OTP Input Change ====================
  const handleOTPChange = (index: number, value: string) => {
    if (value.length > 1 || !/^\d*$/.test(value)) return

    const currentOtp = form.getValues("otp").split("")
    currentOtp[index] = value
    form.setValue("otp", currentOtp.join(""), { shouldValidate: true })

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  // ==================== Backspace Handling ====================
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !e.currentTarget.value && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  // ==================== Form Submit ====================
  const onSubmit = async (data: ResetPasswordFormData) => {
    if (!userId) {
      toast({
        title: "Error",
        description: "Invalid reset request",
        variant: "destructive",
      })
      return
    }

    try {
      await resetPassword({ ...data, userId }).unwrap()

      toast({
        title: "Success!",
        description: "Password has been reset successfully. You are now logged in.",
      })

      window.location.href = "/profile"
    } catch (error: any) {
      const errorMessage = error?.data?.error || error?.data?.message || "Something went wrong"

      // Specific handling for wrong OTP
      if (errorMessage.toLowerCase().includes("otp") || 
          errorMessage.toLowerCase().includes("code") || 
          errorMessage.toLowerCase().includes("invalid")) {
        toast({
          title: "Invalid OTP",
          description: "The code you entered is incorrect or has expired. Please try again.",
          variant: "destructive",
        })
        form.setError("otp", { message: "Invalid or expired OTP" })
      } 
      // Handle other errors
      else if (error?.status === "FETCH_ERROR") {
        toast({
          title: "Network Error",
          description: "Please check your internet connection and try again.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Reset Failed",
          description: errorMessage,
          variant: "destructive",
        })
      }
    }
  }

  // Auto-focus first OTP field
  useEffect(() => {
    setTimeout(() => {
      inputRefs.current[0]?.focus()
    }, 150)
  }, [])

  if (!userId) {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-gray-600 mb-4">Invalid reset request</p>
            <Button onClick={() => onSwitchView("forgot-password")}>
              Request Password Reset
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="mx-auto h-12 w-12 flex items-center justify-center bg-orange-600 rounded-full mb-4">
          <KeyRound className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">Reset Password</h1>
        <p className="mt-2 text-gray-600">
          Enter the code from your email and set a new password
        </p>

        {/* Show email OTP was sent to */}
        {email && (
          <p className="mt-3 text-sm text-gray-500">
            Code sent to: <span className="font-medium text-gray-700">{email}</span>
          </p>
        )}
      </div>

      {/* Main Card */}
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-semibold">Set New Password</CardTitle>
          <CardDescription>Enter the 6-digit code and your new password</CardDescription>
        </CardHeader>

        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* OTP Field */}
              <FormField
                control={form.control}
                name="otp"
                render={() => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Reset Code</FormLabel>
                    <FormControl>
                      <div className="flex justify-center gap-3">
                        {[0, 1, 2, 3, 4, 5].map((index) => (
                          <Input
                            key={index}
                            ref={(el) => (inputRefs.current[index] = el)}
                            type="text"
                            maxLength={1}
                            inputMode="numeric"
                            className="w-12 h-12 text-center text-xl font-bold border-2 border-gray-200 
                                       focus:border-orange-500 focus:ring-orange-500 rounded-lg"
                            value={otpValue[index] || ""}
                            onChange={(e) => handleOTPChange(index, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(index, e)}
                            onPaste={index === 0 ? handlePaste : undefined}
                            disabled={isLoading}
                          />
                        ))}
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* New Password Field */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">New Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter new password"
                          className="pr-10 h-12 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirm Password Field */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          {...field}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm new password"
                          className="pr-10 h-12 border-gray-200 focus:border-orange-500 focus:ring-orange-500"
                          disabled={isLoading}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage /> {/* This will show "Passwords don't match" */}
                  </FormItem>
                )}
              />

              {/* Reset Password Button */}
              <Button
                type="submit"
                className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-medium transition-all duration-200 hover:scale-[1.02]"
                disabled={isLoading || otpValue.length !== 6}
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Resetting password...</span>
                  </div>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </form>
          </Form>

          {/* Back Link */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => onSwitchView("forgot-password")}
              className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-500 transition-colors"
            >
              <ArrowLeft className="h-3 w-3" />
              Back to forgot password
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}