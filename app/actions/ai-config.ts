'use server';

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth2';
import { revalidatePath } from 'next/cache';
import { AI_PROVIDERS } from '@/lib/ai-providers';

export type AIConfigFormData = {
  provider: string;
  model: string;
  apiKey: string;
  temperature: number;
  maxTokens: number;
  isActive: boolean;
};

export async function getAIConfigurations() {
  const session = await getSession();
  if (!session?.user?.organizationId) return [];

  // All users in org can view configs (admin check only for create/update/delete)
  const configs = await prisma.aIConfiguration.findMany({
    where: { organizationId: session.user.organizationId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      provider: true,
      model: true,
      apiKey: true,
      temperature: true,
      maxTokens: true,
      isActive: true,
      otherParams: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Mask API keys for display
  return configs.map(c => ({
    ...c,
    apiKeyMasked: maskApiKey(c.apiKey),
  }));
}

export async function createAIConfiguration(data: AIConfigFormData) {
  const session = await getSession();
  if (!session?.user?.organizationId) {
    return { error: 'Unauthorized' };
  }

  const isOwner = await checkIsOrgOwnerOrAdmin(session.user.id, session.user.organizationId);


  try {
    // If setting as active, deactivate others of same provider
    if (data.isActive) {
      await prisma.aIConfiguration.updateMany({
        where: {
          organizationId: session.user.organizationId,
          provider: data.provider,
          isActive: true,
        },
        data: { isActive: false },
      });
    }

    const config = await prisma.aIConfiguration.create({
      data: {
        organizationId: session.user.organizationId,
        provider: data.provider,
        model: data.model,
        apiKey: data.apiKey,
        temperature: data.temperature,
        maxTokens: data.maxTokens,
        isActive: data.isActive,
        otherParams: {},
      },
    });

    revalidatePath('/admin/settings');
    return { success: true, id: config.id };
  } catch (error: any) {
    // Handle unique constraint
    if (error?.code === 'P2002') {
      return { error: 'A configuration for this provider already exists. Please edit the existing one instead.' };
    }
    return { error: 'Failed to create configuration' };
  }
}

export async function updateAIConfiguration(configId: string, data: Partial<AIConfigFormData>) {
  const session = await getSession();
  if (!session?.user?.organizationId) {
    return { error: 'Unauthorized' };
  }

  const isOwner = await checkIsOrgOwnerOrAdmin(session.user.id, session.user.organizationId);


  // Verify config belongs to org
  const existing = await prisma.aIConfiguration.findFirst({
    where: { id: configId, organizationId: session.user.organizationId },
  });
  if (!existing) return { error: 'Configuration not found' };

  try {
    // If setting as active, deactivate others of same provider
    if (data.isActive) {
      await prisma.aIConfiguration.updateMany({
        where: {
          organizationId: session.user.organizationId,
          provider: data.provider ?? existing.provider,
          isActive: true,
          NOT: { id: configId },
        },
        data: { isActive: false },
      });
    }

    const updateData: any = {};
    if (data.provider !== undefined) updateData.provider = data.provider;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.apiKey !== undefined && data.apiKey.trim() !== '' && !data.apiKey.startsWith('sk-***')) {
      updateData.apiKey = data.apiKey;
    }
    if (data.temperature !== undefined) updateData.temperature = data.temperature;
    if (data.maxTokens !== undefined) updateData.maxTokens = data.maxTokens;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    await prisma.aIConfiguration.update({
      where: { id: configId },
      data: updateData,
    });

    revalidatePath('/admin/settings');
    return { success: true };
  } catch {
    return { error: 'Failed to update configuration' };
  }
}

export async function deleteAIConfiguration(configId: string) {
  const session = await getSession();
  if (!session?.user?.organizationId) {
    return { error: 'Unauthorized' };
  }

  const isOwner = await checkIsOrgOwnerOrAdmin(session.user.id, session.user.organizationId);
  if (!isOwner) {
    return { error: 'Only organization admins can manage AI configurations' };
  }

  const existing = await prisma.aIConfiguration.findFirst({
    where: { id: configId, organizationId: session.user.organizationId },
  });
  if (!existing) return { error: 'Configuration not found' };

  await prisma.aIConfiguration.delete({ where: { id: configId } });

  revalidatePath('/admin/settings');
  return { success: true };
}

export async function testAIConfiguration(configId: string) {
  const session = await getSession();
  if (!session?.user?.organizationId) {
    return { error: 'Unauthorized' };
  }

  const config = await prisma.aIConfiguration.findFirst({
    where: { id: configId, organizationId: session.user.organizationId },
  });
  if (!config) return { error: 'Configuration not found' };

  try {
    const { generateText } = await import('ai');
    const { createOpenAI } = await import('@ai-sdk/openai');
    const { createAnthropic } = await import('@ai-sdk/anthropic');
    const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
    const { createXai } = await import('@ai-sdk/xai');
    const { createGroq } = await import('@ai-sdk/groq');

    let model: any;
    switch (config.provider) {
      case 'openai':
        model = createOpenAI({ apiKey: config.apiKey })(config.model);
        break;
      case 'anthropic':
        model = createAnthropic({ apiKey: config.apiKey })(config.model);
        break;
      case 'google':
        model = createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
        break;
      case 'xai':
        model = createXai({ apiKey: config.apiKey })(config.model);
        break;
      case 'groq':
        model = createGroq({ apiKey: config.apiKey })(config.model);
        break;
      case 'deepinfra':
        model = createOpenAI({ apiKey: config.apiKey, baseURL: 'https://api.deepinfra.com/v1/openai' })(config.model);
        break;
      default:
        model = createOpenAI({ apiKey: config.apiKey })(config.model);
    }

    const result = await generateText({
      model,
      prompt: 'Reply with just "OK" to confirm the connection works.',
      maxOutputTokens: 10,
    });

    const text = result.text?.trim() || '';
    if (text) {
      return { success: true, message: `Connection successful. Model responded: "${text}"` };
    }
    return { error: 'Model did not respond. Please check your API key and model selection.' };
  } catch (error: any) {
    const msg = error?.message || 'Unknown error';
    if (msg.includes('401') || msg.includes('Unauthorized') || msg.includes('invalid_api_key') || msg.includes('incorrect')) {
      return { error: 'Invalid API key. Please check your credentials.' };
    }
    if (msg.includes('404') || msg.includes('not found') || msg.includes('does not exist')) {
      return { error: `Model "${config.model}" not found for provider "${config.provider}". Please check the model name.` };
    }
    if (msg.includes('429') || msg.includes('rate limit') || msg.includes('quota') || msg.includes('Too Many Requests')) {
      return { error: 'Rate limited or quota exceeded. The API key is valid but you have hit the rate limit. Wait 30-60 seconds and try again.' };
    }
    if (msg.includes('insufficient') || msg.includes('billing') || msg.includes('payment')) {
      return { error: 'Billing issue with your API provider. Please check your account balance.' };
    }
    if (msg.includes('Unsupported model') || msg.includes('specification version')) {
      return { error: `Model "${config.model}" may not be compatible. Try a different model for this provider.` };
    }
    return { error: `Connection test failed: ${msg.slice(0, 200)}` };
  }
}

export async function getActiveAIConfig() {
  const session = await getSession();
  if (!session?.user?.organizationId) return null;

  return prisma.aIConfiguration.findFirst({
    where: { organizationId: session.user.organizationId, isActive: true },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      provider: true,
      model: true,
      temperature: true,
      maxTokens: true,
      isActive: true,
    },
  });
}

// Helpers
async function checkIsOrgOwnerOrAdmin(userId: string, organizationId: string): Promise<boolean> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { ownerId: true },
  });
  if (org?.ownerId === userId) return true;

  const permissions = await prisma.userPermission.findMany({
    where: { userId, isActive: true, granted: true },
    select: { isSystemAdmin: true },
  });
  if (permissions.some(p => p.isSystemAdmin)) return true;

  const assignments = await prisma.userUnitAssignment.findMany({
    where: { userId },
    include: { role: true },
  });
  return assignments.some(a => a.role.isAdmin);
}

function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return key.slice(0, 4) + '***' + key.slice(-4);
}
