"use client"

/**
 * AuthPanel — production-grade split-screen auth shell.
 *
 * Layout:
 *   - Mobile (<lg): single column, brand block collapses to a slim header.
 *   - Desktop (≥lg): two columns. Left = brand/marketing pane with a subtle
 *     gradient and a few feature bullets. Right = form column.
 *
 * Animation: each view fades + slides in via the `key` swap below; no extra
 * runtime dependency. Keeps the panel snappy and respects reduced-motion.
 */

import { useState } from "react"
import { ShieldCheck, Lock, Sparkles, BarChart3 } from "lucide-react"
import type { AuthView, AuthState } from "./types"
import LoginView from "./LoginView"
import RegisterView from "./RegisterView"
import ForgotPasswordView from "./ForgotPasswordView"
import VerifyOTPView from "./VerifyOTPView"
import ResetPasswordView from "./ResetPasswordView"

interface AuthPanelProps {
  initialView?: AuthView
  initialUserId?: string
  initialOtpType?: string
}

export default function AuthPanel({
  initialView = "login",
  initialUserId,
  initialOtpType,
}: AuthPanelProps) {
  const [state, setState] = useState<AuthState>({
    view: initialView,
    userId: initialUserId,
    otpType: initialOtpType,
  })

  const switchView = (view: AuthView, extra?: Partial<Omit<AuthState, "view">>) => {
    setState((prev) => ({ ...prev, view, ...extra }))
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left brand pane — desktop only */}
      <BrandPane />

      {/* Form pane */}
      <main className="flex-1 flex flex-col min-h-screen">
        {/* Mobile brand strip */}
        <header className="lg:hidden border-b bg-gradient-to-r from-primary/10 via-primary/5 to-background px-5 py-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary text-primary-foreground flex items-center justify-center shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight">Nessco ERP</div>
            <div className="text-[11px] text-muted-foreground truncate">
              Operations, HR, payroll & more
            </div>
          </div>
        </header>

        <div className="flex-1 flex items-center justify-center px-4 py-6 sm:px-6 sm:py-10">
          <div
            key={state.view}
            className="w-full max-w-md animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
          >
            {state.view === "login" && <LoginView onSwitchView={switchView} />}
            {state.view === "register" && <RegisterView onSwitchView={switchView} />}
            {state.view === "forgot-password" && (
              <ForgotPasswordView onSwitchView={switchView} />
            )}
            {state.view === "verify-otp" && (
              <VerifyOTPView
                userId={state.userId}
                otpType={state.otpType}
                onSwitchView={switchView}
              />
            )}
            {state.view === "reset-password" && (
              <ResetPasswordView userId={state.userId} onSwitchView={switchView} />
            )}
          </div>
        </div>

        <footer className="px-5 py-4 border-t text-[11px] text-muted-foreground flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Nessco. All rights reserved.</span>
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" />
            Encrypted in transit & at rest
          </span>
        </footer>
      </main>
    </div>
  )
}

function BrandPane() {
  return (
    <aside
      className="hidden lg:flex relative w-[44%] max-w-[640px] flex-col justify-between p-10 text-white overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at top left, #6366f1 0%, #4338ca 35%, #1e1b4b 100%)",
      }}
    >
      {/* Decorative glow */}
      <div
        className="absolute inset-0 opacity-30 mix-blend-screen pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 80% 20%, rgba(168,85,247,0.6), transparent 50%), radial-gradient(circle at 20% 80%, rgba(59,130,246,0.6), transparent 50%)",
        }}
      />

      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-base font-semibold tracking-tight">Nessco ERP</div>
            <div className="text-xs text-white/70">Run your entire operation, in one place.</div>
          </div>
        </div>
      </div>

      <div className="relative z-10 space-y-7">
        <div>
          <h2 className="text-3xl xl:text-4xl font-bold leading-tight">
            One workspace for HR,
            <br />
            payroll & operations.
          </h2>
          <p className="mt-3 text-white/75 text-sm leading-relaxed max-w-md">
            Sign in to access your dashboards, approvals, and team.
            Built for teams that need control without the bloat.
          </p>
        </div>

        <ul className="space-y-3 max-w-sm">
          <FeatureBullet
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Enterprise security"
            sub="2FA, account lockout, audit log, role-based access."
          />
          <FeatureBullet
            icon={<Lock className="h-4 w-4" />}
            title="Multi-tenant by design"
            sub="Each org's data isolated end-to-end."
          />
          <FeatureBullet
            icon={<BarChart3 className="h-4 w-4" />}
            title="Real-time insights"
            sub="Live dashboards across attendance, leave, payroll."
          />
        </ul>
      </div>

      <div className="relative z-10 text-xs text-white/50">
        Trusted by operations teams across India.
      </div>
    </aside>
  )
}

function FeatureBullet({
  icon,
  title,
  sub,
}: {
  icon: React.ReactNode
  title: string
  sub: string
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-white/15 backdrop-blur">
        {icon}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-white/65">{sub}</span>
      </span>
    </li>
  )
}
