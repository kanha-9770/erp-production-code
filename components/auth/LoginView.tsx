   "use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LoginSchema } from "@/lib/utils/validations"
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
import { Loader2, LogIn, Mail, Lock, Eye, EyeOff } from "lucide-react"
import type { z } from "zod"
import { useLoginMutation } from "@/lib/api/auth"
import type { AuthViewProps } from "./types"

type LoginFormData = z.infer<typeof LoginSchema>

export default function LoginView({ onSwitchView }: AuthViewProps) {
  const [showPassword, setShowPassword] = useState(false)
  const { toast } = useToast()
  const [login, { isLoading }] = useLoginMutation()
  const searchParams = useSearchParams()
  const rawCallback = searchParams.get("callbackUrl") || "/profile"
  // Normalise: strip double-leading-slash (protocol-relative URLs like //form/...)
  // and reject any absolute http(s) URL to prevent open-redirect abuse
  const callbackUrl = rawCallback.startsWith("//")
    ? rawCallback.slice(1)
    : rawCallback.startsWith("/")
    ? rawCallback
    : "/profile"

  const form = useForm<LoginFormData>({
    resolver: zodResolver(LoginSchema),
    defaultValues: { email: "", password: "" },
  })

  const { setError, clearErrors } = form

  const onSubmit = async (data: LoginFormData) => {
    clearErrors()
    try {
      const result = await login({ email: data.email, password: data.password }).unwrap()

      if (result.requiresOTP && result.userId) {
        toast({ title: "Login Code Sent", description: "Check your email for the login verification code" })
        onSwitchView("verify-otp", { userId: result.userId, otpType: "login" })
      } else {
        toast({ title: "Welcome back!", description: "You have been successfully logged in" })
        setTimeout(() => { window.location.href = callbackUrl }, 1200)
      }
    } catch (err: any) {
      const errorData = err?.data
      const status = err?.status || errorData?.statusCode || 500
      const serverMessage = (errorData?.error || errorData?.message || "").toLowerCase()

      if (
        status === 404 ||
        serverMessage.includes("not registered") ||
        serverMessage.includes("not found") ||
        serverMessage.includes("does not exist") ||
        serverMessage.includes("no account") ||
        serverMessage.includes("user not found")
      ) {
        setError("email", { type: "manual", message: "User not found. Please sign up." })
        toast({
          title: "User Not Found",
          description: "No user found with this email. Sign up below.",
          variant: "destructive",
          duration: 6000,
        })
        return
      }

      if (
        status === 401 ||
        serverMessage.includes("invalid") ||
        serverMessage.includes("incorrect") ||
        serverMessage.includes("wrong password") ||
        serverMessage.includes("invalid credentials")
      ) {
        setError("password", { type: "manual", message: "Incorrect password. Please try again." })
        toast({ title: "Invalid Credentials", description: "The password you entered is incorrect.", variant: "destructive" })
        return
      }

      if (
        serverMessage.includes("locked") ||
        serverMessage.includes("attempt") ||
        serverMessage.includes("temporarily blocked") ||
        serverMessage.includes("rate limit") ||
        status === 429
      ) {
        toast({
          title: "Account Restricted",
          description: serverMessage || "Too many failed attempts. Try again later or reset your password.",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Login Failed",
        description: errorData?.error || errorData?.message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          Sign in to continue to your workspace.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...field}
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      className="pl-10 h-11"
                      disabled={isLoading}
                      onChange={(e) => {
                        clearErrors("email")
                        field.onChange(e)
                      }}
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Password
                  </FormLabel>
                  <button
                    type="button"
                    onClick={() => onSwitchView("forgot-password")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot?
                  </button>
                </div>
                <FormControl>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...field}
                      type={showPassword ? "text" : "password"}
                      placeholder="Leave empty for OTP login"
                      autoComplete="current-password"
                      className="pl-10 pr-10 h-11"
                      disabled={isLoading}
                      onChange={(e) => {
                        clearErrors("password")
                        field.onChange(e)
                      }}
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            className="w-full h-11 font-medium"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4 mr-2" />
                Sign in
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-[11px] uppercase tracking-wider">
          <span className="bg-background px-2 text-muted-foreground">
            or use a one-time code
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        Leave the password field empty and we&apos;ll email a 6-digit code.
      </p>

      <p className="text-sm text-center text-muted-foreground">
        Don&apos;t have an account?{" "}
        <button
          type="button"
          onClick={() => onSwitchView("register")}
          className="font-medium text-primary hover:underline"
        >
          Create one
        </button>
      </p>
    </div>
  )
}
