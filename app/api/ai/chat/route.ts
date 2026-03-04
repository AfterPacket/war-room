import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { sanitizeSearchQuery } from '@/lib/security/sanitize';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';
import { SITUATION_ROOM_SYSTEM_PROMPT } from '@/lib/ai/prompts';
import { z } from 'zod';

const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  provider: z.enum(['claude', 'openai', 'gemini']),
  model: z.string().max(100).optional(),
  context: z.string().max(5000).optional(),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:ai-chat`, 30, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  try {
    const body = await request.json();
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
    }

    const { provider, model, context } = parsed.data;
    const message = sanitizeSearchQuery(parsed.data.message);
    const fullMessage = context ? `Context:\n${sanitizeSearchQuery(context)}\n\nQuestion: ${message}` : message;

    // Get decrypted API key
    const encrypted = getApiKey(provider);
    if (!encrypted) {
      return NextResponse.json({ error: `No ${provider} API key configured. Add it in Settings.` }, { status: 401 });
    }
    const apiKey = decryptApiKey(encrypted);

    // Stream response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          if (provider === 'claude') {
            await streamClaude(apiKey, model || 'claude-sonnet-4-6', fullMessage, controller, encoder);
          } else if (provider === 'openai') {
            await streamOpenAI(apiKey, model || 'gpt-4o', fullMessage, controller, encoder);
          } else if (provider === 'gemini') {
            await streamGemini(apiKey, model || 'gemini-2.0-flash', fullMessage, controller, encoder);
          }
          controller.close();
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'AI service error';
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
          controller.close();
        }
      },
    });

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function streamClaude(
  apiKey: string, model: string, message: string,
  controller: ReadableStreamDefaultController, encoder: TextEncoder
) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: SITUATION_ROOM_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude API error: ${res.status} ${errText}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const text = json.delta?.text || '';
        if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      } catch {}
    }
  }
}

async function streamOpenAI(
  apiKey: string, model: string, message: string,
  controller: ReadableStreamDefaultController, encoder: TextEncoder
) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SITUATION_ROOM_SYSTEM_PROMPT },
        { role: 'user', content: message },
      ],
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI HTTP ${res.status}: ${errText.slice(0, 120)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
    for (const line of lines) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const text = json.choices?.[0]?.delta?.content || '';
        if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      } catch {}
    }
  }
}

async function streamGemini(
  apiKey: string, model: string, message: string,
  controller: ReadableStreamDefaultController, encoder: TextEncoder
) {
  // alt=sse switches Gemini to proper SSE format (data: {...}\n\n) instead of a JSON array
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: message }] }],
        systemInstruction: { parts: [{ text: SITUATION_ROOM_SYSTEM_PROMPT }] },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 120)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');
  const dec = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = dec.decode(value);
    const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
    for (const line of lines) {
      try {
        const json = JSON.parse(line.slice(6));
        const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
      } catch {}
    }
  }
}
