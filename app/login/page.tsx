import { Suspense } from "react"
import AuthPanel from "@/components/auth/AuthPanel"

export default function LoginPage() {
  return (
    <Suspense>
      <AuthPanel initialView="login" />
    </Suspense>
  )
}
