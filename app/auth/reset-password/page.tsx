import { Suspense } from 'react'
import ResetPasswordForm from '@/components/ResetPasswordForm'

export default async function AuthResetPasswordPage(props: { searchParams: Promise<{ userId?: string }> }) {
  const searchParams = await props.searchParams;
  return (
    <Suspense fallback={<div>Loading reset form...</div>}>
      <ResetPasswordForm userId={searchParams.userId} />
    </Suspense>
  )
}
