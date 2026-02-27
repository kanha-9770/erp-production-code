import { Suspense } from 'react'
import ResetPasswordForm from '@/components/ResetPasswordForm' // Adjust path as needed
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// Server component - receives searchParams prop automatically
export default function ResetPasswordPage({ searchParams }: { searchParams: { userId?: string } }) {
  return (
    <Suspense fallback={<div>Loading reset form...</div>}>
      <ResetPasswordForm userId={searchParams.userId} />
    </Suspense>
  )
}