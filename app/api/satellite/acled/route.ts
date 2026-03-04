import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { bboxSchema } from '@/lib/security/sanitize';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';
import { z } from 'zod';

const acledSchema = z.object({
  bbox: bboxSchema,
  daysBack: z.number().int().min(1).max(90).default(30),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:satellite-acled`, 10, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = acledSchema.safeParse({
      bbox: {
        west: parseFloat(searchParams.get('west') || '-180'),
        south: parseFloat(searchParams.get('south') || '-90'),
        east: parseFloat(searchParams.get('east') || '180'),
        north: parseFloat(searchParams.get('north') || '90'),
      },
      daysBack: searchParams.get('daysBack') ? parseInt(searchParams.get('daysBack')!) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { bbox, daysBack } = parsed.data;
    const encrypted = getApiKey('acled');
    if (!encrypted) {
      return NextResponse.json({ error: 'ACLED API key not configured', events: [] }, { status: 200 });
    }

    let email = '';
    let apiKey = decryptApiKey(encrypted);

    // Support "email:key" format stored in the acled field
    const emailEncrypted = getApiKey('acled-email');
    if (emailEncrypted) {
      email = decryptApiKey(emailEncrypted);
    } else if (apiKey.includes(':')) {
      const parts = apiKey.split(':');
      email = parts[0];
      apiKey = parts.slice(1).join(':');
    }

    const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    const emailParam = email ? `&email=${encodeURIComponent(email)}` : '';

    // ACLED API v1: BETWEEN uses pipe-separated values in the same param, not event_date2
    const url = `https://api.acleddata.com/acled/read?key=${encodeURIComponent(apiKey)}${emailParam}&event_date=${since}|${today}&event_date_where=BETWEEN&latitude=${bbox.south}|${bbox.north}&latitude_where=BETWEEN&longitude=${bbox.west}|${bbox.east}&longitude_where=BETWEEN&fields=event_date|event_type|actor1|country|admin1|latitude|longitude|fatalities|notes&limit=200`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`ACLED HTTP error: ${res.status}`);
    const data = await res.json();

    // ACLED returns status in body even on auth failures (HTTP 200 with status:400)
    if (data.status && data.status !== 200) {
      const msg = data.messages?.message || data.messages || `ACLED error ${data.status}`;
      return NextResponse.json({ error: String(msg), events: [] }, { status: 200 });
    }

    const events = (data.data || []).map((e: {
      event_date: string;
      event_type: string;
      actor1: string;
      country: string;
      admin1: string;
      latitude: string;
      longitude: string;
      fatalities: string;
      notes: string;
    }) => ({
      date: e.event_date,
      type: e.event_type,
      actor: e.actor1,
      country: e.country,
      region: e.admin1,
      lat: parseFloat(e.latitude),
      lon: parseFloat(e.longitude),
      fatalities: parseInt(e.fatalities) || 0,
      notes: e.notes?.slice(0, 200),
    }));

    return NextResponse.json({ events, count: events.length });
  } catch (error) {
    console.error('ACLED error:', error);
    return NextResponse.json({ error: 'Failed to fetch conflict data', events: [] }, { status: 500 });
  }
}
