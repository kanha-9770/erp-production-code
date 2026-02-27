import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get('userId')
    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId is required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const email = user.email
    // Mask email: show first char, then ****, then domain
    const [local, domain] = email.split('@')
    let maskedLocal = local
    if (local.length <= 2) maskedLocal = local[0] + '*'
    else maskedLocal = local[0] + '*'.repeat(Math.max(1, local.length - 2)) + local.slice(-1)

    const maskedEmail = `${maskedLocal}@${domain}`

    return NextResponse.json({ success: true, email: user.email, maskedEmail })
  } catch (error) {
    console.error('Get user email error:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
