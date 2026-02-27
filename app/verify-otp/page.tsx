import { Suspense } from 'react'
import VerifyOTPForm from '@/components/VerifyOTPForm' // Adjust path to match your structure

// Server component - receives searchParams prop automatically
export default function VerifyOTPPage({ searchParams }: { searchParams: { userId?: string; type?: string } }) {
  return (
    <Suspense fallback={<div>Loading verification form...</div>}>
      <VerifyOTPForm userId={searchParams.userId} type={searchParams.type} />
    </Suspense>
  )
}