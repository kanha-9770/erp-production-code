import { NextRequest, NextResponse } from 'next/server'
import { getUserPermissionOverrides } from '@/lib/database/database'

export async function GET() {
  try {
    const overrides = await getUserPermissionOverrides()

    return NextResponse.json({
      success: true, 
      data: overrides 
    })
  } catch (error) {
    console.error('[v0] Failed to fetch user permission overrides:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch user permission overrides',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}