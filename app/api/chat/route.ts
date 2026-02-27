// app/api/chat/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = await validateSession(token);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const conversation = await prisma.chatConversation.create({
      data: {
        userId,
        title: 'New conversation',
        metadata: {
          createdAt: new Date().toISOString(),
          source: 'web',
        },
      },
      select: {
        id: true,
        title: true,
        startedAt: true,
        endedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: conversation,
    });
  } catch (err: any) {
    console.error('[POST /api/chat]', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to create conversation',
        ...(process.env.NODE_ENV === 'development' && { details: err.message }),
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const session = await validateSession(token);

    if (!session || !session.user?.id) {
      return NextResponse.json(
        { success: false, error: 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const userId = session.user.id;

    const conversations = await prisma.chatConversation.findMany({
      where: { userId },
      orderBy: { startedAt: 'desc' },
      select: {
        id: true,
        title: true,
        startedAt: true,
        endedAt: true,
        metadata: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
      take: 50,
    });

    return NextResponse.json({
      success: true,
      data: conversations,
    });
  } catch (err: any) {
    console.error('[GET /api/chat]', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to list conversations',
        ...(process.env.NODE_ENV === 'development' && { details: err.message }),
      },
      { status: 500 }
    );
  }
}