export type AuthView =
  | "login"
  | "register"
  | "forgot-password"
  | "verify-otp"
  | "reset-password"

export interface AuthState {
  view: AuthView
  userId?: string
  otpType?: string
}

export interface AuthViewProps {
  onSwitchView: (view: AuthView, extra?: Partial<Omit<AuthState, "view">>) => void
}
