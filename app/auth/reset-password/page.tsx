import { Suspense } from 'react'
import ResetPasswordForm from '@/components/ResetPasswordForm'

export default function AuthResetPasswordPage({ searchParams }: { searchParams: { userId?: string } }) {
  return (
    <Suspense fallback={<div>Loading reset form...</div>}>
      <ResetPasswordForm userId={searchParams.userId} />
    </Suspense>
  )
}
