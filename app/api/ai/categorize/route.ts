import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';
import { CATEGORIZATION_PROMPT } from '@/lib/ai/prompts';
import { z } from 'zod';

const categorizeSchema = z.object({
  headlines: z.array(z.object({
    id: z.string().max(100),
    title: z.string().max(500),
  })).max(20),
  provider: z.enum(['claude', 'openai', 'gemini']).optional().default('claude'),
});

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:ai-categorize`, 10, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  try {
    const body = await request.json();
    const parsed = categorizeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    const { headlines, provider } = parsed.data;
    const encrypted = getApiKey(provider);
    if (!encrypted) {
      // Return uncategorized items as fallback
      return NextResponse.json({
        categories: headlines.map((h) => ({
          id: h.id,
          category: 'general',
          severity: 'medium',
          region: 'global',
        })),
      });
    }

    const apiKey = decryptApiKey(encrypted);
    const headlineText = headlines.map((h) => `ID:${h.id} | ${h.title}`).join('\n');

    let result: { id: string; category: string; severity: string; region: string }[] = [];

    if (provider === 'claude') {
      result = await categorizeClaude(apiKey, headlineText);
    } else if (provider === 'openai') {
      result = await categorizeOpenAI(apiKey, headlineText);
    } else {
      result = await categorizeGemini(apiKey, headlineText);
    }

    return NextResponse.json({ categories: result });
  } catch (error) {
    console.error('Categorize error:', error);
    return NextResponse.json({ error: 'Categorization failed' }, { status: 500 });
  }
}

async function categorizeClaude(apiKey: string, text: string) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: CATEGORIZATION_PROMPT,
      messages: [{ role: 'user', content: text }],
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Claude categorize failed: ${res.status} ${errText}`);
  }
  const data = await res.json();
  const content = data.content?.[0]?.text || '[]';
  try { return JSON.parse(content); } catch { return []; }
}

async function categorizeOpenAI(apiKey: string, text: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: CATEGORIZATION_PROMPT },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!res.ok) throw new Error('OpenAI categorize failed');
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '[]';
  try { return JSON.parse(content); } catch { return []; }
}

async function categorizeGemini(apiKey: string, text: string) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        systemInstruction: { parts: [{ text: CATEGORIZATION_PROMPT }] },
      }),
    }
  );
  if (!res.ok) throw new Error('Gemini categorize failed');
  const data = await res.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  try { return JSON.parse(content); } catch { return []; }
}
