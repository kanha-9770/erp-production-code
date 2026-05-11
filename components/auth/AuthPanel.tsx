"use client"

/**
 * AuthPanel — Zoho/Odoo-style ERP auth shell.
 *
 * Layout:
 *   - Mobile (<lg): single column, slim brand strip on top.
 *   - Desktop (≥lg): two columns. Left = form column with brand mark
 *     fixed top-left. Right = soft-tinted product preview panel.
 */

import { useEffect, useState } from "react"
import {
  Sparkles,
  ChevronDown,
  CheckCircle2,
  Users,
  Wallet,
  CalendarClock,
  TrendingUp,
  Receipt,
  PiggyBank,
  Banknote,
  UserCheck,
  Clock,
  UserX,
  Plane,
} from "lucide-react"
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
    <div className="h-screen flex bg-white overflow-hidden">
      {/* Form pane (left) */}
      <main className="flex-1 flex flex-col h-screen relative overflow-y-auto">
        {/* Top bar with brand */}
        <header className="px-6 sm:px-10 py-4 flex items-center shrink-0">
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold tracking-tight text-slate-900 group-hover:text-primary transition-colors">
                Nessco
              </div>
              <div className="text-[10.5px] text-slate-500 -mt-0.5">
                ERP Suite
              </div>
            </div>
          </a>
        </header>

        {/* Centered form area */}
        <div className="flex-1 flex items-center justify-center px-6 py-4 sm:py-6">
          <div
            key={state.view}
            className="w-full max-w-[400px] animate-in fade-in-0 duration-200"
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

        {/* Footer */}
        <footer className="px-6 sm:px-10 py-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-[12px] text-slate-500 shrink-0">
          <div className="flex items-center gap-4">
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-slate-700 transition-colors"
            >
              English (US)
              <ChevronDown className="h-3 w-3" />
            </button>
            <span>© {new Date().getFullYear()} Nessco Technologies Pvt. Ltd.</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/terms" className="hover:text-slate-700 transition-colors">
              Terms
            </a>
            <a href="/privacy" className="hover:text-slate-700 transition-colors">
              Privacy
            </a>
            <a href="/security" className="hover:text-slate-700 transition-colors">
              Security
            </a>
          </div>
        </footer>
      </main>

      {/* Right showcase pane */}
      <ShowcasePane />
    </div>
  )
}

type DashboardSlide = {
  id: string
  eyebrow: string
  title: string
  metrics: Array<{
    icon: React.ReactNode
    label: string
    value: string
    tone: "blue" | "indigo" | "amber" | "emerald" | "rose" | "violet"
  }>
  bottomTitle: string
  bottomRows: Array<{ name: string; action: string; time: string }>
  notif: { title: string; sub: string }
}

const DASHBOARDS: DashboardSlide[] = [
  {
    id: "ops",
    eyebrow: "Today",
    title: "Operations Overview",
    metrics: [
      { icon: <Users className="h-3.5 w-3.5" />, label: "Present today", value: "248 / 261", tone: "blue" },
      { icon: <Wallet className="h-3.5 w-3.5" />, label: "Payroll run", value: "₹38.4L", tone: "indigo" },
      { icon: <CalendarClock className="h-3.5 w-3.5" />, label: "Leave pending", value: "12 requests", tone: "amber" },
      { icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Productivity", value: "+8.2% MoM", tone: "emerald" },
    ],
    bottomTitle: "Recent activity",
    bottomRows: [
      { name: "Anita S.", action: "approved leave", time: "2m" },
      { name: "Payroll", action: "finalized for May", time: "1h" },
      { name: "Rohan T.", action: "checked in", time: "3h" },
    ],
    notif: { title: "May payroll closed", sub: "₹38.4L · 261 employees" },
  },
  {
    id: "payroll",
    eyebrow: "May 2026",
    title: "Payroll Insights",
    metrics: [
      { icon: <Banknote className="h-3.5 w-3.5" />, label: "Net pay", value: "₹32.1L", tone: "emerald" },
      { icon: <Receipt className="h-3.5 w-3.5" />, label: "Tax deducted", value: "₹4.8L", tone: "rose" },
      { icon: <PiggyBank className="h-3.5 w-3.5" />, label: "Reimbursements", value: "₹1.5L", tone: "indigo" },
      { icon: <TrendingUp className="h-3.5 w-3.5" />, label: "Bonuses paid", value: "₹2.0L", tone: "violet" },
    ],
    bottomTitle: "Pending approvals",
    bottomRows: [
      { name: "Salary revision", action: "8 employees", time: "Today" },
      { name: "Bonus payout", action: "Q1 — finance team", time: "1d" },
      { name: "Reimbursements", action: "14 claims", time: "2d" },
    ],
    notif: { title: "Salary slips dispatched", sub: "Sent to 261 inboxes" },
  },
  {
    id: "attendance",
    eyebrow: "This week",
    title: "Attendance & Leave",
    metrics: [
      { icon: <UserCheck className="h-3.5 w-3.5" />, label: "On time", value: "220", tone: "emerald" },
      { icon: <Clock className="h-3.5 w-3.5" />, label: "Late check-in", value: "28", tone: "amber" },
      { icon: <UserX className="h-3.5 w-3.5" />, label: "Absent", value: "13", tone: "rose" },
      { icon: <Plane className="h-3.5 w-3.5" />, label: "On leave", value: "12", tone: "blue" },
    ],
    bottomTitle: "Upcoming leave",
    bottomRows: [
      { name: "Vikram J.", action: "earned leave", time: "Mon" },
      { name: "Sneha P.", action: "WFH approved", time: "Tue" },
      { name: "Arjun K.", action: "casual leave", time: "Thu" },
    ],
    notif: { title: "12 requests need approval", sub: "Review in HR queue" },
  },
]

function ShowcasePane() {
  const [active, setActive] = useState(0)

  // Auto-rotate continuously every 4s. Resets when `active` changes
  // (e.g. after a manual dot click), so the timer always restarts fresh.
  useEffect(() => {
    const id = setInterval(() => {
      setActive((i) => (i + 1) % DASHBOARDS.length)
    }, 4000)
    return () => clearInterval(id)
  }, [active])

  const slide = DASHBOARDS[active]

  return (
    <aside className="hidden lg:flex relative w-[46%] max-w-[680px] h-screen flex-col justify-center items-center p-8 xl:p-12 bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/30 border-l border-slate-100 overflow-hidden">
      {/* Soft accent shapes */}
      <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-blue-200/30 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-12 h-72 w-72 rounded-full bg-indigo-200/30 blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-[460px] space-y-7">
        {/* Headline */}
        <div className="text-center space-y-3">
          <h2 className="text-[26px] xl:text-[28px] font-semibold tracking-tight text-slate-900 leading-tight">
            Run HR, payroll & operations
            <br />
            from one workspace.
          </h2>
          <p className="text-[14px] text-slate-600 leading-relaxed">
            Loved by 500+ growing businesses across India.
          </p>
        </div>

        {/* Carousel of dashboard previews */}
        <div className="relative">
          {/* Main card — keyed so React remounts on slide change for the fade-in animation */}
          <div
            key={slide.id}
            className="rounded-xl bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-200 overflow-hidden animate-in fade-in-0 slide-in-from-right-2 duration-500"
          >
            {/* Window chrome */}
            <div className="flex items-center gap-1.5 px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/50">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
              <div className="ml-3 h-4 flex-1 max-w-[140px] rounded bg-slate-100" />
            </div>

            {/* Content */}
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                    {slide.eyebrow}
                  </div>
                  <div className="text-[15px] font-semibold text-slate-900 mt-0.5">
                    {slide.title}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-[10.5px] font-medium ring-1 ring-emerald-100">
                  <CheckCircle2 className="h-3 w-3" />
                  Live
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {slide.metrics.map((m) => (
                  <MetricTile
                    key={m.label}
                    icon={m.icon}
                    label={m.label}
                    value={m.value}
                    tone={m.tone}
                  />
                ))}
              </div>

              {/* Bottom section */}
              <div className="rounded-lg border border-slate-100 p-3 space-y-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
                  {slide.bottomTitle}
                </div>
                {slide.bottomRows.map((r) => (
                  <ActivityRow key={r.name} name={r.name} action={r.action} time={r.time} />
                ))}
              </div>
            </div>
          </div>

          {/* Floating notification card — also tied to active slide */}
          <div
            key={`notif-${slide.id}`}
            className="absolute -bottom-5 -right-4 rounded-lg bg-white shadow-lg shadow-slate-900/10 ring-1 ring-slate-200 px-3 py-2.5 flex items-center gap-2.5 max-w-[230px] animate-in fade-in-0 slide-in-from-bottom-2 duration-500"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold text-slate-900 truncate">
                {slide.notif.title}
              </div>
              <div className="text-[10.5px] text-slate-500 truncate">
                {slide.notif.sub}
              </div>
            </div>
          </div>
        </div>

        {/* Carousel controls */}
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="flex items-center gap-2">
            {DASHBOARDS.map((d, i) => {
              const isActive = i === active
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setActive(i)}
                  aria-label={`Show ${d.title}`}
                  aria-current={isActive}
                  className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-300 ${
                    isActive
                      ? "w-10 bg-slate-200"
                      : "w-1.5 bg-slate-300 hover:bg-slate-400"
                  }`}
                >
                  {isActive && (
                    <span
                      key={`fill-${slide.id}`}
                      className="absolute inset-y-0 left-0 bg-primary auth-progress-fill"
                    />
                  )}
                </button>
              )
            })}
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            {slide.title}
            <span className="text-slate-300 mx-2">·</span>
            <span className="text-slate-400">
              {active + 1} / {DASHBOARDS.length}
            </span>
          </div>
        </div>

        {/* Trust strip */}
        <div className="border-t border-slate-200/70 pt-5 flex items-center justify-center gap-6 text-[11px] uppercase tracking-[0.12em] text-slate-400 font-medium">
          <span>SOC 2 Type II</span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>ISO 27001</span>
          <span className="h-1 w-1 rounded-full bg-slate-300" />
          <span>GDPR</span>
        </div>
      </div>
    </aside>
  )
}

function MetricTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode
  label: string
  value: string
  tone: "blue" | "indigo" | "amber" | "emerald" | "rose" | "violet"
}) {
  const toneClass = {
    blue: "bg-blue-50 text-blue-600 ring-blue-100",
    indigo: "bg-indigo-50 text-indigo-600 ring-indigo-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
  }[tone]

  return (
    <div className="rounded-lg border border-slate-100 p-2.5">
      <div className="flex items-center gap-1.5">
        <span
          className={`flex h-5 w-5 items-center justify-center rounded ring-1 ${toneClass}`}
        >
          {icon}
        </span>
        <span className="text-[10.5px] uppercase tracking-wider text-slate-400 font-medium">
          {label}
        </span>
      </div>
      <div className="text-[14px] font-semibold text-slate-900 mt-1.5">
        {value}
      </div>
    </div>
  )
}

function ActivityRow({
  name,
  action,
  time,
}: {
  name: string
  action: string
  time: string
}) {
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
      <span className="font-medium text-slate-700">{name}</span>
      <span className="text-slate-500 truncate">{action}</span>
      <span className="ml-auto text-slate-400">{time}</span>
    </div>
  )
}
