import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { apiKeySchema } from '@/lib/security/sanitize';
import { encryptApiKey, decryptApiKey } from '@/lib/security/encryption';
import { getApiKey, setApiKey, deleteApiKey, getConfiguredServices } from '@/lib/db';
import { z } from 'zod';

const putSchema = z.object({
  service: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
  key: apiKeySchema,
});

const deleteSchema = z.object({
  service: z.string().min(1).max(50).regex(/^[a-zA-Z0-9_-]+$/),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:settings-keys-get`, 30, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Return list of configured services (not the keys themselves)
  const services = getConfiguredServices();
  return NextResponse.json({ services });
}

export async function PUT(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:settings-keys-put`, 20, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  try {
    const body = await request.json();
    const parsed = putSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
    }

    const { service, key } = parsed.data;
    const encrypted = encryptApiKey(key);
    setApiKey(service, encrypted);

    return NextResponse.json({ success: true, service });
  } catch (error) {
    console.error('Error saving API key:', error);
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:settings-keys-delete`, 20, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  try {
    const body = await request.json();
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    }

    deleteApiKey(parsed.data.service);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting API key:', error);
    return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 });
  }
}

// Internal helper — get decrypted key (not exposed directly, used by other routes)
export async function getDecryptedKey(service: string): Promise<string | null> {
  const encrypted = getApiKey(service);
  if (!encrypted) return null;
  try {
    return decryptApiKey(encrypted);
  } catch {
    return null;
  }
}
