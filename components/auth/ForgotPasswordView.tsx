"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import { Loader2, KeyRound, Mail, ArrowLeft } from "lucide-react"
import type { AuthViewProps } from "./types"
import { useForgotPasswordMutation } from "@/lib/api/auth"

const EmailSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
})

type ForgotPasswordFormData = z.infer<typeof EmailSchema>

export default function ForgotPasswordView({ onSwitchView }: AuthViewProps) {
  const { toast } = useToast()
  const [forgotPassword, { isLoading }] = useForgotPasswordMutation()

  const form = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(EmailSchema),
    defaultValues: { email: "" },
  })

  const onSubmit = async (data: ForgotPasswordFormData) => {
    try {
      const result = await forgotPassword(data).unwrap()
      toast({
        title: "Check your email",
        description: "We've sent a 6-digit code to reset your password.",
      })
      onSwitchView("reset-password", { userId: (result as any)?.userId })
    } catch (error: any) {
      const message = error?.data?.error || "Failed to send reset code. Please try again."
      if (error?.status === "FETCH_ERROR") {
        toast({
          title: "Network Error",
          description: "Unable to connect. Please check your internet connection.",
          variant: "destructive",
        })
      } else {
        toast({ title: "Error", description: message, variant: "destructive" })
      }
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary/10 text-primary">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Forgot password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we&apos;ll send you a 6-digit reset code.
          </p>
        </div>
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
                    />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full h-11 font-medium" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending code…
              </>
            ) : (
              "Send reset code"
            )}
          </Button>
        </form>
      </Form>

      <div className="text-center">
        <button
          type="button"
          onClick={() => onSwitchView("login")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to sign in
        </button>
      </div>
    </div>
  )
}
