import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { sanitizeSearchQuery } from '@/lib/security/sanitize';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:map-geocode`, 20, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const query = sanitizeSearchQuery(searchParams.get('q') || '');
  if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 });

  const encrypted = getApiKey('mapbox');
  if (!encrypted) {
    return NextResponse.json({ error: 'Mapbox key not configured' }, { status: 401 });
  }

  try {
    const key = decryptApiKey(encrypted);
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${key}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Geocode failed');
    const data = await res.json();
    const feature = data.features?.[0];
    if (!feature) return NextResponse.json({ result: null });
    return NextResponse.json({
      result: {
        name: feature.place_name,
        center: feature.center,
        bbox: feature.bbox,
      },
    });
  } catch (error) {
    console.error('Geocode error:', error);
    return NextResponse.json({ error: 'Geocoding failed' }, { status: 500 });
  }
}
