"use client"

import { useState } from "react"
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      {state.view === "login" && (
        <LoginView onSwitchView={switchView} />
      )}
      {state.view === "register" && (
        <RegisterView onSwitchView={switchView} />
      )}
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
        <ResetPasswordView
          userId={state.userId}
          onSwitchView={switchView}
        />
      )}
    </div>
  )
}
