'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth2';
import type { UIMessage } from 'ai';
import { Client } from "basic-ftp";
import { Readable } from "stream";

// ====================== FTP CONFIG ======================
const FTP_HOST = "217.21.82.234";
const FTP_USER = "u386199748.businesscardglobal";
const FTP_PASSWORD = "Kafka@India1122";
const FTP_PORT = 21;
const FTP_UPLOAD_DIR = "businesscard";
const PUBLIC_ACCESS_URL = "https://businesscard.nesscoglobal.com";

async function uploadToHostinger(buffer: Buffer, filename: string): Promise<string> {
  const client = new Client();
  try {
    await client.access({ host: FTP_HOST, user: FTP_USER, password: FTP_PASSWORD, port: FTP_PORT, secure: false });
    await client.cd(FTP_UPLOAD_DIR);
    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, filename);
    return `${PUBLIC_ACCESS_URL}/${filename}`;
  } catch (error) {
    console.error("[FTP] Error:", error);
    throw error;
  } finally {
    client.close();
  }
}

export async function uploadFile(formData: FormData): Promise<string> {
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file selected");
  const buffer = Buffer.from(await file.arrayBuffer());
  const safeName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "")}`;
  return await uploadToHostinger(buffer, safeName);
}

// ====================== CONVERSATION ACTIONS ======================
export async function createConversation(title?: string) {
  const session = await getSession();
  if (!session?.user) return null;

  return prisma.chatConversation.create({
    data: {
      userId: session.user.id,
      title: title || 'New Conversation',
      metadata: { organizationId: session.user.organizationId },
    },
  });
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
        select: { content: true, sender: true },
      },
    },
  });
}

// 🔥 FIXED - Restores full AI response (text + tool cards) + exact order
export async function getConversationMessages(conversationId: string) {
  const session = await getSession();
  if (!session?.user) return [];

  const conversation = await prisma.chatConversation.findFirst({
    where: { id: conversationId, userId: session.user.id },
  });
  if (!conversation) return [];

  const dbMessages = await prisma.chatMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },   // ← EXACT CONVERSATION ORDER
    select: {
      id: true,
      sender: true,
      content: true,
      metadata: true,
    },
  });

  return dbMessages.map((m: any) => {
    let parts = [{ type: 'text' as const, text: m.content || '' }];

    if (m.metadata?.parts && Array.isArray(m.metadata.parts)) {
      parts = m.metadata.parts;
    }

    return {
      id: m.id,
      role: m.sender === 'user' ? 'user' : 'assistant',
      parts,
    } as UIMessage;
  });
}

export async function saveMessage(
  conversationId: string,
  role: 'user' | 'ai',
  content: string,
  parts?: any[]
) {
  const session = await getSession();
  if (!session?.user) return null;

  return prisma.chatMessage.create({
    data: {
      conversationId,
      sender: role,
      content,
      metadata: parts ? { parts } : {},
    },
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
    base.push('List all users and their roles', 'Show recent audit log activity');
  } else {
    base.push('Show my recent activity', 'What forms have I submitted to?');
  }
  return base;
}