"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { RegisterSchema } from "@/lib/utils/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Mail, ArrowRight, User } from "lucide-react"
import type { z } from "zod"
import { useRegisterMutation } from "@/lib/api/auth"
import type { AuthViewProps } from "./types"
import { PasswordInput } from "./PasswordInput"

type RegisterFormData = z.infer<typeof RegisterSchema>

export default function RegisterView({ onSwitchView }: AuthViewProps) {
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
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll send a 6-digit verification code to confirm your email.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Full Name
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...field}
                      type="text"
                      placeholder="Jane Doe"
                      autoComplete="name"
                      className="pl-10 h-11"
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
                <FormLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Password
                </FormLabel>
                <FormControl>
                  <PasswordInput
                    {...field}
                    placeholder="At least 10 characters"
                    autoComplete="new-password"
                    disabled={isLoading}
                    onChange={(e) => {
                      clearErrors("password")
                      field.onChange(e)
                    }}
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
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    disabled={isLoading}
                    onChange={(e) => {
                      clearErrors("confirmPassword")
                      field.onChange(e)
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full h-11 font-medium" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending verification code…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <p className="text-sm text-center text-muted-foreground">
        Already have an account?{" "}
        <button
          type="button"
          onClick={() => onSwitchView("login")}
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </button>
      </p>

      <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
        By continuing you agree to the Terms and Privacy Policy.
      </p>
    </div>
  )
}
