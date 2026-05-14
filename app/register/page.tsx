import { Suspense } from "react"
import AuthPanel from "@/components/auth/AuthPanel"

// Next.js 14 requires `useSearchParams` (used inside RegisterView for the
// ?ref= / ?invite= referral handoff) to be wrapped in a Suspense boundary
// or the page bails out to client-only rendering and can hang during the
// initial paint. The boundary is the one-line fix.
export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <AuthPanel initialView="register" />
    </Suspense>
  )
}
