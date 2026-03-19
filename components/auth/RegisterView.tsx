"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RegisterSchema } from "@/lib/validations"
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
import { Loader2, Mail, ArrowRight, User, Lock, Eye, EyeOff } from "lucide-react"
import type { z } from "zod"
import { useRegisterMutation } from "@/lib/api/auth"
import type { AuthViewProps } from "./types"

type RegisterFormData = z.infer<typeof RegisterSchema>

export default function RegisterView({ onSwitchView }: AuthViewProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const { toast } = useToast()
  const [register, { isLoading }] = useRegisterMutation()

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  })

  const { setError, clearErrors } = form

  const onSubmit = async (data: RegisterFormData) => {
    clearErrors()
    try {
      const result = await register({
        name: data.name,
        email: data.email,
        password: data.password,
        confirmPassword: data.confirmPassword,
      }).unwrap()

      toast({ title: "Success!", description: "Verification code sent to your email" })
      onSwitchView("verify-otp", { userId: result.userId, otpType: "registration" })
    } catch (err: any) {
      const errorData = err?.data
      const status = err?.status || errorData?.statusCode || 500
      const serverMessage = errorData?.error || errorData?.message || "Registration failed"

      if (
        status === 409 ||
        serverMessage.toLowerCase().includes("already exists") ||
        serverMessage.toLowerCase().includes("already registered") ||
        serverMessage.toLowerCase().includes("email taken")
      ) {
        setError("email", {
          type: "manual",
          message: "This email is already registered. Please use a different email or sign in.",
        })
        toast({ title: "Email Already Taken", description: "This email is already in use.", variant: "destructive" })
        return
      }

      if (
        status === 400 &&
        (serverMessage.toLowerCase().includes("password") ||
          serverMessage.toLowerCase().includes("weak") ||
          serverMessage.toLowerCase().includes("complexity"))
      ) {
        setError("password", {
          type: "manual",
          message: serverMessage || "Password is too weak or doesn't meet requirements",
        })
        toast({ title: "Invalid Password", description: serverMessage || "Please choose a stronger password", variant: "destructive" })
        return
      }

      if (status === 400) {
        toast({ title: "Invalid Information", description: serverMessage || "Please check the information you entered", variant: "destructive" })
        return
      }

      if (!errorData || status >= 500) {
        toast({ title: "Server Error", description: "Something went wrong on our end. Please try again later.", variant: "destructive" })
        return
      }

      toast({ title: "Registration Failed", description: serverMessage || "An unexpected error occurred", variant: "destructive" })
    }
  }

  return (
    <div className="w-full max-w-md space-y-4">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 flex items-center justify-center bg-blue-600 rounded-full mb-4">
          <Mail className="h-6 w-6 text-white" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Create Account</h1>
        <p className="text-gray-600 text-sm">Fill in your details to create your account</p>
      </div>

      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-xl font-semibold">Register</CardTitle>
          <CardDescription className="text-sm">Create your account and verify your email address</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Full Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="Enter your full name"
                          className="pl-10 h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          disabled={isLoading}
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                          placeholder="Create a password"
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

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Confirm Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                        <Input
                          {...field}
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Confirm your password"
                          className="pl-10 pr-10 h-10 border-gray-200 focus:border-blue-500 focus:ring-blue-500"
                          disabled={isLoading}
                          onChange={(e) => { clearErrors("confirmPassword"); field.onChange(e) }}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-3 h-4 w-4 text-gray-400 hover:text-gray-600"
                        >
                          {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
                    <span>Sending verification code...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span>Send Verification Code</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600">
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => onSwitchView("login")}
                className="font-medium text-blue-600 hover:text-blue-500 transition-colors"
              >
                Sign in
              </button>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="text-center">
        <p className="text-xs text-gray-500">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  )
}
