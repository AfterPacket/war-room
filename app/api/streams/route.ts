import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { validateExternalUrl } from '@/lib/security/ssrf';
import { getCustomStreams, saveCustomStream, deleteCustomStream, setCustomStreamEnabled } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';

const streamSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  url: z.string().url().max(2048),
  category: z.string().max(50).default('Custom'),
  enabled: z.boolean().default(true),
  user_agent: z.string().max(512).optional(),
  referer: z.string().max(512).optional(),
  origin_header: z.string().max(512).optional(),
  cookies: z.string().max(2048).optional(),
  notes: z.string().max(1000).optional(),
});

const patchSchema = z.object({
  id: z.string(),
  enabled: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
  url: z.string().url().max(2048).optional(),
  user_agent: z.string().max(512).optional(),
  referer: z.string().max(512).optional(),
  origin_header: z.string().max(512).optional(),
  cookies: z.string().max(2048).optional(),
  notes: z.string().max(1000).optional(),
});

// GET — list all custom streams
export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:streams-get`, 30, 60000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const streams = getCustomStreams();
  return NextResponse.json({ streams });
}

// POST — create new custom stream
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:streams-post`, 20, 60000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const parsed = streamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const data = parsed.data;

  // SSRF check on the stream URL
  const safe = await validateExternalUrl(data.url);
  if (!safe) {
    return NextResponse.json({ error: 'URL is not allowed (private/internal IP detected)' }, { status: 400 });
  }

  const id = data.id || crypto.randomUUID();
  saveCustomStream({ ...data, id });

  return NextResponse.json({ success: true, id }, { status: 201 });
}

// PATCH — update name/url/headers/enabled
export async function PATCH(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:streams-patch`, 20, 60000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
  }

  const { id, enabled, ...fields } = parsed.data;

  const streams = getCustomStreams();
  const existing = streams.find((s) => s.id === id);
  if (!existing) return NextResponse.json({ error: 'Stream not found' }, { status: 404 });

  if (typeof enabled === 'boolean') {
    setCustomStreamEnabled(id, enabled);
  }

  if (Object.keys(fields).length > 0) {
    if (fields.url) {
      const safe = await validateExternalUrl(fields.url);
      if (!safe) return NextResponse.json({ error: 'URL is not allowed' }, { status: 400 });
    }
    saveCustomStream({ ...existing, ...fields, id });
  }

  return NextResponse.json({ success: true });
}

// DELETE — remove stream and associated data
export async function DELETE(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:streams-delete`, 20, 60000)) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  deleteCustomStream(id);
  return NextResponse.json({ success: true });
}
