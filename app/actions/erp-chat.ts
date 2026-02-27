'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth2';

export async function createConversation(title?: string) {
  const session = await getSession();
  if (!session?.user) return null;

  const conversation = await prisma.chatConversation.create({
    data: {
      userId: session.user.id,
      title: title || 'New Conversation',
      metadata: { organizationId: session.user.organizationId },
    },
  });

  return conversation;
}

export async function getConversations() {
  const session = await getSession();
  if (!session?.user) return [];

  return prisma.chatConversation.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, sender: true, createdAt: true },
      },
    },
  });
}

export async function getConversationMessages(conversationId: string) {
  const session = await getSession();
  if (!session?.user) return [];

  const conversation = await prisma.chatConversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });
  if (!conversation) return [];

  return prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      sender: true,
      content: true,
      metadata: true,
      createdAt: true,
    },
  });
}

export async function updateConversationTitle(conversationId: string, title: string) {
  const session = await getSession();
  if (!session?.user) return null;

  return prisma.chatConversation.updateMany({
    where: { id: conversationId, userId: session.user.id },
    data: { title },
  });
}

export async function deleteConversation(conversationId: string) {
  const session = await getSession();
  if (!session?.user) return null;

  return prisma.chatConversation.deleteMany({
    where: { id: conversationId, userId: session.user.id },
  });
}

export async function getSuggestedQuestions() {
  const session = await getSession();
  if (!session?.user?.organizationId) return [];

  // Check user's role for context-aware suggestions
  const permissions = await prisma.userPermission.findMany({
    where: { userId: session.user.id, isActive: true, granted: true },
    select: { isSystemAdmin: true },
  });
  const isAdmin = permissions.some(p => p.isSystemAdmin);

  const assignments = await prisma.userUnitAssignment.findMany({
    where: { userId: session.user.id },
    include: { role: true },
  });
  const hasManagerRole = assignments.some(a => a.role.level <= 2) || isAdmin;

  const base = [
    'Show me an overview of our organization',
    'What modules and forms are available?',
    'Show submission trends for the last 30 days',
    'What is the status breakdown of all records?',
  ];

  if (hasManagerRole) {
    base.push(
      'List all users and their roles',
      'Show recent audit log activity',
      'Which forms have the most submissions?',
      'Compare this month with last month',
    );
  } else {
    base.push(
      'Show my recent activity',
      'What forms have I submitted to?',
    );
  }

  return base;
}
