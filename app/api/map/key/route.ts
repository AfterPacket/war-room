import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:map-key`, 30, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const encrypted = getApiKey('mapbox');
  if (!encrypted) {
    return NextResponse.json({ key: null });
  }

  try {
    const key = decryptApiKey(encrypted);
    return NextResponse.json({ key });
  } catch {
    return NextResponse.json({ key: null });
  }
}
