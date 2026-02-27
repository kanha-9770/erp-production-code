// app/api/chat/[conversationId]/route.ts
export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from 'next/server';
import { validateSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Gemini configuration - using stable models that fully support parallel tool calling
export const API_KEYS: string[] = [
  "AIzaSyAEk8FQ8Q4QhAca-zuh3nEt8eCwkZ94g44",
  "AIzaSyBMHKn9hFr7sNmiH7Xn5cFa1pznQ9DnzFY",
  // add more for rotation/failover
];

export const MODELS: string[] = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-light",
];

export const BASE_API_URL: string = "https://generativelanguage.googleapis.com/v1beta/models/";

// ===================================================================
// Tool Handlers - these fetch REAL user data (modules, forms, records)
// ===================================================================
async function handleFunction(
  name: string,
  args: any,
  context: { userId: string; organizationId: string | null }
) {
  // ---------- Get Modules (hierarchical) ----------
  if (name === "get_modules") {
    const { parent_id } = args || {};
    const where: any = { organizationId: context.organizationId };
    if (parent_id === null || parent_id === "root" || parent_id === undefined) {
      where.parentId = null;
    } else if (parent_id) {
      where.parentId = parent_id;
    }

    const modules = await prisma.formModule.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });

    return { modules };
  }

  // ---------- Get Forms (optionally inside a module) ----------
  if (name === "get_forms") {
    const { module_id } = args || {};

    const where: any = { organizationId: context.organizationId };
    if (module_id) {
      where.moduleId = module_id; // assuming your Form model has moduleId field
    }

    const forms = await prisma.form.findMany({
      where,
      select: {
        id: true,
        name: true,
        description: true,
        moduleId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { name: "asc" },
    });

    return { forms };
  }

  // ---------- Get Records for a Form (latest N) ----------
  if (name === "get_records") {
    const { form_id, limit = 15 } = args;
    if (!form_id) throw new Error("form_id is required");

    // Security check - form must belong to user's org
    const form = await prisma.form.findUnique({
      where: { id: form_id },
      select: { organizationId: true, tableMapping: true, name: true },
    });

    if (!form || form.organizationId !== context.organizationId) {
      throw new Error("Form not found or access denied");
    }

    // Dynamic table access (exactly like your existing /api/forms/[formId]/records route)
    const match = (form.tableMapping as any)?.storageTable?.match(/form_records_(\d+)/);
    if (!match) {
      return { records: [], formName: form.name, warning: "No storage table mapped" };
    }

    const modelName = `formRecord${match[1]}`;
    // @ts-ignore - dynamic model access (same pattern you already use)
    const records = await (prisma as any)[modelName].findMany({
      where: { formId: form_id },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Return raw recordData - AI can read and summarize it
    const cleanRecords = records.map((r: any) => ({
      id: r.id,
      createdAt: r.createdAt,
      recordData: r.recordData,
    }));

    return { formName: form.name, records: cleanRecords };
  }

  throw new Error(`Unknown function: ${name}`);
}

// ===================================================================
// GET - Load conversation (unchanged)
// ===================================================================
export async function GET(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  // ... your existing GET code (unchanged) ...
  // (I kept it exactly as you had it)
  try {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const session = await validateSession(token);

    if (!session || !session.user?.id) {
      return NextResponse.json({ success: false, error: 'Invalid or expired session' }, { status: 401 });
    }

    const userId = session.user.id;

    const conversation = await prisma.chatConversation.findUnique({
      where: { id: params.conversationId },
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
          select: { id: true, sender: true, content: true, timestamp: true, metadata: true },
        },
      },
    });

    if (!conversation) {
      return NextResponse.json({ success: false, error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Forbidden: not your conversation' }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        conversation: {
          id: conversation.id,
          title: conversation.title,
          startedAt: conversation.startedAt,
          endedAt: conversation.endedAt,
          metadata: conversation.metadata,
        },
        messages: conversation.messages,
      },
    });
  } catch (err: any) {
    console.error('[GET /api/chat/[conversationId]]', err);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load conversation',
        ...(process.env.NODE_ENV === 'development' && { details: err.message }),
      },
      { status: 500 }
    );
  }
}

// ===================================================================
// POST - User message → Gemini with tool calling
// ===================================================================
export async function POST(
  request: NextRequest,
  { params }: { params: { conversationId: string } }
) {
  try {
    const token = request.cookies.get('auth-token')?.value;
    if (!token) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const session = await validateSession(token);
    if (!session || !session.user?.id) {
      return NextResponse.json({ success: false, error: 'Invalid or expired session' }, { status: 401 });
    }

    const userId = session.user.id;

    // Get organizationId (critical for data isolation)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true },
    });
    const organizationId = user?.organizationId || null;

    const body = await request.json();
    const { content } = body;
    if (!content?.trim()) {
      return NextResponse.json({ success: false, error: 'Message content is required' }, { status: 400 });
    }

    // Load conversation + messages
    const conversation = await prisma.chatConversation.findUnique({
      where: { id: params.conversationId },
      include: { messages: { orderBy: { timestamp: 'asc' } } },
    });

    if (!conversation || conversation.userId !== userId) {
      return NextResponse.json({ success: false, error: 'Conversation not found or forbidden' }, { status: 404 });
    }

    // Save user message
    await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        sender: 'user',
        content: content.trim(),
        metadata: { clientIp: request.headers.get('x-forwarded-for') || 'unknown', userAgent: request.headers.get('user-agent') || 'unknown' },
      },
    });

    // Build message history for Gemini
    let messages = [
      {
        role: 'user',
        parts: [{ text: "You are an expert assistant for this user's form builder app. You have full access to their modules, forms, and records via tools. Always use the tools to fetch real, up-to-date data when the user asks about their content. Never make up module names, form names, field values, or records. If you need data → call the tools. You can reason, summarize, analyze, and give insights based on the real data." }],
      },
      ...conversation.messages.map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      })),
      { role: 'user', parts: [{ text: content.trim() }] },
    };

    // Tool definitions (sent to Gemini) - fixed types to single strings
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_modules",
            description: "Fetch form modules (folders). Use parent_id = 'root' for top-level modules. Pass empty string or omit for root.",
            parameters: {
              type: "OBJECT",
              properties: {
                parent_id: { 
                  type: "STRING", 
                  description: "Parent module ID or 'root' for top level. Can be omitted for root." 
                },
              },
            },
          },
          {
            name: "get_forms",
            description: "Fetch forms, optionally filtered by module.",
            parameters: {
              type: "OBJECT",
              properties: {
                module_id: { 
                  type: "STRING", 
                  description: "Optional module ID to get forms inside it. Can be omitted for all forms." 
                },
              },
            },
          },
          {
            name: "get_records",
            description: "Get the latest records for a specific form.",
            parameters: {
              type: "OBJECT",
              properties: {
                form_id: { type: "STRING", description: "Required form ID" },
                limit: { type: "NUMBER", description: "Max records to return (default 15)" },
              },
              required: ["form_id"],
            },
          },
        ],
      },
    ];

    // Model & key selection
    const model = MODELS[0];
    const apiKey = API_KEYS[0];
    const url = `${BASE_API_URL}${model}:generateContent?key=${apiKey}`;

    let finalReply = "";
    let loopMessages = [...messages];

    // Tool calling loop (handles parallel + sequential calls)
    while (true) {
      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: loopMessages,
          tools,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 4096,
            topP: 0.95,
          },
        }),
      });

      if (!geminiRes.ok) {
        const err = await geminiRes.text();
        console.error("Gemini error:", geminiRes.status, err);
        throw new Error("Gemini API failed");
      }

      const data = await geminiRes.json();
      const candidate = data.candidates?.[0];
      if (!candidate) throw new Error("No candidate");

      const parts = candidate.content?.parts || [];
      const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text).join("");
      finalReply += textParts;

      const functionCalls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);

      if (functionCalls.length === 0) break; // done

      // Append model's message (with function calls)
      loopMessages.push({ role: "model", parts });

      // Execute all function calls (parallel supported)
      for (const fc of functionCalls) {
        const { name, args } = fc;
        let result;
        try {
          result = await handleFunction(name, args, { userId, organizationId });
        } catch (e: any) {
          result = { error: e.message || "Tool execution failed" };
        }

        loopMessages.push({
          role: "user",
          parts: [{
            functionResponse: {
              name,
              response: result,
            },
          }],
        });
      }
    }

    finalReply = finalReply.trim() || "I fetched the data you needed.";

    // Save AI reply
    const aiMessage = await prisma.chatMessage.create({
      data: {
        conversationId: conversation.id,
        sender: "ai",
        content: finalReply,
        metadata: { model, provider: "google-gemini" },
      },
    });

    // Auto-title conversation
    if (conversation.title === "New conversation" && conversation.messages.length <= 1) {
      await prisma.chatConversation.update({
        where: { id: conversation.id },
        data: { title: content.trim().slice(0, 60) + (content.trim().length > 60 ? "..." : "") },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        userMessage: { content: content.trim(), sender: "user" },
        aiMessage,
      },
    });

  } catch (err: any) {
    console.error("[POST /api/chat/[conversationId]]", err);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get AI response",
        ...(process.env.NODE_ENV === "development" && { details: err.message }),
      },
      { status: 500 }
    );
  }
}