   "use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { LoginSchema } from "@/lib/validations"
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
    <div className="w-full max-w-md space-y-4">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 flex items-center justify-center bg-blue-600 rounded-full mb-4">
          <LogIn className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Welcome Back</h1>
        <p className="text-gray-600 text-sm">Sign in to your account to continue</p>
      </div>

      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-semibold">Sign In</CardTitle>
          <CardDescription>Enter your email and password to access your account</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Email Address</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="Enter your email address"
                          className="pl-10 h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          disabled={isLoading}
                          onChange={(e) => { clearErrors("email"); field.onChange(e) }}
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
                    <FormLabel className="text-sm font-medium">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="pl-10 pr-10 h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          disabled={isLoading}
                          onChange={(e) => { clearErrors("password"); field.onChange(e) }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
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
                className="w-full h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium transition-all duration-200 hover:scale-[1.02]"
                disabled={isLoading}
              >
                {isLoading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Signing in...</span>
                  </div>
                ) : (
                  "Sign In"
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitchView("register")}
                className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
              >
                Sign up
              </button>
            </p>
            <p className="text-sm text-gray-600">
              Forgot your password?{" "}
              <button
                type="button"
                onClick={() => onSwitchView("forgot-password")}
                className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
              >
                Reset it here
              </button>
            </p>
          </div>

          <div className="mt-4 text-center">
            <p className="text-xs text-gray-500">
              For passwordless login, leave password field empty and we&apos;ll send you a verification code.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <p className="text-xs text-gray-500">Protected by advanced security measures and encryption.</p>
      </div>
    </div>
  )
}
