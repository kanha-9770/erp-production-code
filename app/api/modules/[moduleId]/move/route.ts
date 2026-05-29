import { NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database/database-service'

export async function POST(request: NextRequest, props: { params: Promise<{ moduleId: string }> }) {
  const params = await props.params;
  try {
    const { parentId } = await request.json()
    
    const movedModule = await DatabaseService.moveModule(params.moduleId, parentId)

    return NextResponse.json({
      success: true,
      data: movedModule,
    })
  } catch (error: any) {
    console.error('Error moving module:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to move module',
      },
      { status: 500 }
    )
  }
}