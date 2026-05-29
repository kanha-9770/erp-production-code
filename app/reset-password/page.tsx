import { Suspense } from "react"
import AuthPanel from "@/components/auth/AuthPanel"

export default async function ResetPasswordPage(
  props: {
    searchParams: Promise<{ userId?: string }>
  }
) {
  const searchParams = await props.searchParams;
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <AuthPanel
        initialView="reset-password"
        initialUserId={searchParams.userId}
      />
    </Suspense>
  )
}
