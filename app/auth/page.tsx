import { Suspense } from "react"
import AuthPanel from "@/components/auth/AuthPanel"
import type { AuthView } from "@/components/auth/types"

const VALID_VIEWS: AuthView[] = ["login", "register", "forgot-password", "verify-otp", "reset-password"]

function isValidView(v: string | undefined): v is AuthView {
  return VALID_VIEWS.includes(v as AuthView)
}

export default async function AuthPage(
  props: {
    searchParams: Promise<{ view?: string; userId?: string; type?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const view: AuthView = isValidView(searchParams.view) ? searchParams.view : "login"

  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AuthPanel
        initialView={view}
        initialUserId={searchParams.userId}
        initialOtpType={searchParams.type}
      />
    </Suspense>
  )
}
