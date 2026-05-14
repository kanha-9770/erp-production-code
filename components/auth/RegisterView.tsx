"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useSearchParams } from "next/navigation"
import { RegisterSchema } from "@/lib/utils/validations"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import {
  Loader2,
  Mail,
  ArrowRight,
  User,
  Sparkles,
  AlertCircle,
  CheckCircle2,
} from "lucide-react"
import type { z } from "zod"
import { useRegisterMutation } from "@/lib/api/auth"
import type { AuthViewProps } from "./types"
import { PasswordInput } from "./PasswordInput"

type RegisterFormData = z.infer<typeof RegisterSchema>

interface SponsorPreview {
  id: string
  name: string | null
  email: string
  image: string | null
  rank: string | null
  organizationName: string | null
}

interface ReferralLookupData {
  kind: "invite" | "sponsor"
  sponsor: SponsorPreview
  expiresAt?: string
}

type LookupState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; data: ReferralLookupData }
  | { status: "error"; message: string }

export default function RegisterView({ onSwitchView }: AuthViewProps) {
  const { toast } = useToast()
  const [register, { isLoading }] = useRegisterMutation()
  const searchParams = useSearchParams()

  const urlReferral = useMemo(() => {
    if (!searchParams) return ""
    return (
      searchParams.get("ref") ??
      searchParams.get("invite") ??
      ""
    ).trim()
  }, [searchParams])

  const [agentMode, setAgentMode] = useState<boolean>(Boolean(urlReferral))
  const [referralCode, setReferralCode] = useState<string>(urlReferral)
  const [codeLocked] = useState<boolean>(Boolean(urlReferral))
  const [lookup, setLookup] = useState<LookupState>({ status: "idle" })
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  })

  const { setError, clearErrors } = form

  // Live lookup whenever referral code changes (or on mount when locked).
  // Each effect run owns its own timer + abort controller; the cleanup is
  // strictly local so a fast-typing user can't accumulate stale fetches that
  // pile onto each other and freeze the input.
  useEffect(() => {
    if (!agentMode) {
      setLookup({ status: "idle" })
      return
    }
    const code = referralCode.trim()
    if (!code) {
      setLookup({ status: "idle" })
      return
    }

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLookup({ status: "loading" })
      try {
        const res = await fetch(
          `/api/real-estate/referral-lookup?code=${encodeURIComponent(code)}`,
          { method: "GET", signal: controller.signal },
        )
        if (controller.signal.aborted) return
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          setLookup({
            status: "error",
            message: errBody?.error || "Invalid referral code",
          })
          return
        }
        const json = await res.json()
        if (controller.signal.aborted) return
        setLookup({ status: "ok", data: json.data as ReferralLookupData })
      } catch (e: any) {
        if (e?.name === "AbortError" || controller.signal.aborted) return
        setLookup({
          status: "error",
          message: "Could not verify referral code",
        })
      }
    }, codeLocked ? 0 : 400)

    debounceRef.current = timer

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [agentMode, referralCode, codeLocked])

  const onSubmit = async (data: RegisterFormData) => {
    clearErrors()

    if (agentMode) {
      const code = referralCode.trim()
      if (!code) {
        toast({
          title: "Referral code required",
          description: "Enter a referral code to join as a real-estate agent.",
          variant: "destructive",
        })
        return
      }
      if (lookup.status !== "ok") {
        toast({
          title: "Invalid referral code",
          description:
            lookup.status === "error"
              ? lookup.message
              : "Please wait for the referral code to be verified.",
          variant: "destructive",
        })
        return
      }
      try {
        window.sessionStorage.setItem("pendingAgentReferral", code)
      } catch {
        // sessionStorage may be unavailable — proceed regardless.
      }
    }

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

  const sponsor =
    lookup.status === "ok" ? lookup.data.sponsor : null
  const sponsorInitials = sponsor?.name
    ? sponsor.name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? "")
        .join("")
    : sponsor?.email?.slice(0, 2).toUpperCase() ?? "?"

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          We&apos;ll send a 6-digit verification code to confirm your email.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
        <Sparkles className="h-4 w-4 mt-0.5 text-primary shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <Label
              htmlFor="agent-mode-toggle"
              className="text-sm font-medium cursor-pointer"
            >
              Join as a real-estate agent
            </Label>
            <Switch
              id="agent-mode-toggle"
              checked={agentMode}
              onCheckedChange={(checked) => {
                setAgentMode(checked)
                if (!checked) {
                  setLookup({ status: "idle" })
                }
              }}
              aria-label="Toggle real-estate agent registration"
              disabled={codeLocked}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sign up using a sponsor or invite referral code.
          </p>
        </div>
      </div>

      {agentMode && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label
              htmlFor="referral-code"
              className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
            >
              Referral code
            </Label>
            <Input
              id="referral-code"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value)}
              placeholder="Enter sponsor code or invite token"
              autoComplete="off"
              readOnly={codeLocked}
              disabled={isLoading}
              className={codeLocked ? "bg-muted/50 h-11" : "h-11"}
              aria-describedby="referral-code-status"
            />
          </div>

          <div id="referral-code-status" aria-live="polite">
            {lookup.status === "loading" && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verifying referral code…
              </div>
            )}

            {lookup.status === "error" && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{lookup.message}</span>
              </div>
            )}

            {lookup.status === "ok" && sponsor && (
              <Card className="border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-900/30 dark:bg-emerald-950/20">
                <CardContent className="flex items-center gap-3 p-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarImage src={sponsor.image ?? undefined} />
                    <AvatarFallback>{sponsorInitials}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">
                        {sponsor.name ?? sponsor.email}
                      </span>
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {sponsor.email}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {sponsor.rank && (
                        <Badge variant="secondary" className="text-[10px]">
                          {sponsor.rank}
                        </Badge>
                      )}
                      {sponsor.organizationName && (
                        <Badge variant="outline" className="text-[10px]">
                          {sponsor.organizationName}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

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

          {agentMode && lookup.status === "ok" && sponsor && (
            <p className="text-center text-xs text-muted-foreground">
              Joining team of{" "}
              <span className="font-medium text-foreground">
                {sponsor.name ?? sponsor.email}
              </span>
            </p>
          )}
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
