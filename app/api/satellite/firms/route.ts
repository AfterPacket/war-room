import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { bboxSchema } from '@/lib/security/sanitize';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';
import { z } from 'zod';

const firmsSchema = z.object({
  bbox: bboxSchema,
  days: z.number().int().min(1).max(10).default(1),
  source: z.enum(['VIIRS_SNPP_NRT', 'MODIS_NRT', 'VIIRS_NOAA20_NRT']).default('VIIRS_SNPP_NRT'),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:satellite-firms`, 20, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = firmsSchema.safeParse({
      bbox: {
        west: parseFloat(searchParams.get('west') || '0'),
        south: parseFloat(searchParams.get('south') || '0'),
        east: parseFloat(searchParams.get('east') || '0'),
        north: parseFloat(searchParams.get('north') || '0'),
      },
      days: searchParams.get('days') ? parseInt(searchParams.get('days')!) : undefined,
      source: searchParams.get('source') || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { bbox, days, source } = parsed.data;
    const encrypted = getApiKey('firms');
    if (!encrypted) {
      return NextResponse.json({ error: 'NASA FIRMS MAP_KEY not configured' }, { status: 401 });
    }

    const mapKey = decryptApiKey(encrypted);
    const bboxStr = `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`;
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/${bboxStr}/${days}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`FIRMS API error: ${res.status}`);

    const csv = await res.text();
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return NextResponse.json({ fires: [] });

    const headers = lines[0].split(',');
    const latIdx = headers.indexOf('latitude');
    const lonIdx = headers.indexOf('longitude');
    const brightnessIdx = headers.indexOf('bright_ti4') !== -1 ? headers.indexOf('bright_ti4') : headers.indexOf('brightness');
    const confidenceIdx = headers.indexOf('confidence');
    const datetimeIdx = headers.indexOf('acq_date');

    const fires = lines.slice(1).map((line) => {
      const cols = line.split(',');
      return {
        lat: parseFloat(cols[latIdx]),
        lon: parseFloat(cols[lonIdx]),
        brightness: parseFloat(cols[brightnessIdx]),
        confidence: cols[confidenceIdx] || 'nominal',
        datetime: cols[datetimeIdx] || '',
      };
    }).filter((f) => !isNaN(f.lat) && !isNaN(f.lon));

    return NextResponse.json({ fires, count: fires.length });
  } catch (error) {
    console.error('FIRMS error:', error);
    return NextResponse.json({ error: 'Failed to fetch fire data' }, { status: 500 });
  }
}
