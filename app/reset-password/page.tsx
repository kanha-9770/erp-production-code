import { Suspense } from "react"
import AuthPanel from "@/components/auth/AuthPanel"

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { userId?: string }
}) {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AuthPanel
        initialView="reset-password"
        initialUserId={searchParams.userId}
      />
    </Suspense>
  )
}
