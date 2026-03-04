import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { bboxSchema } from '@/lib/security/sanitize';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';
import { z } from 'zod';

const sentinelSchema = z.object({
  bbox: bboxSchema,
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(['sentinel-2-l2a', 'sentinel-1-grd']).default('sentinel-2-l2a'),
  visualization: z.enum(['truecolor', 'falsecolor', 'ndvi', 'sar']).default('truecolor'),
  width: z.number().int().min(64).max(1024).default(512),
  height: z.number().int().min(64).max(1024).default(512),
  maxCloud: z.number().int().min(0).max(100).default(30),
});

const EVALSCRIPTS: Record<string, string> = {
  truecolor: `//VERSION=3
function setup(){return{input:["B04","B03","B02"],output:{bands:3}}}
function evaluatePixel(s){return[2.5*s.B04,2.5*s.B03,2.5*s.B02]}`,
  falsecolor: `//VERSION=3
function setup(){return{input:["B08","B04","B03"],output:{bands:3}}}
function evaluatePixel(s){return[2.5*s.B08,2.5*s.B04,2.5*s.B03]}`,
  ndvi: `//VERSION=3
function setup(){return{input:["B08","B04"],output:{bands:3}}}
function evaluatePixel(s){
  const ndvi=(s.B08-s.B04)/(s.B08+s.B04);
  const r=Math.max(0,Math.min(1,0.5-ndvi));
  const g=Math.max(0,Math.min(1,ndvi));
  return[r,g,0];
}`,
  sar: `//VERSION=3
function setup(){return{input:["VV"],output:{bands:1}}}
function evaluatePixel(s){return[Math.sqrt(s.VV)]}`,
};

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:satellite-sentinel`, 15, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const contentType = request.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 415 });
  }

  try {
    const body = await request.json();
    const parsed = sentinelSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 });
    }

    const clientIdEnc = getApiKey('sentinel-client-id');
    const clientSecretEnc = getApiKey('sentinel-client-secret');
    if (!clientIdEnc || !clientSecretEnc) {
      return NextResponse.json({ error: 'Sentinel Hub credentials not configured' }, { status: 401 });
    }

    const clientId = decryptApiKey(clientIdEnc);
    const clientSecret = decryptApiKey(clientSecretEnc);

    // Get OAuth token
    const tokenRes = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.json({ error: 'Sentinel Hub authentication failed' }, { status: 401 });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const { bbox, dateFrom, dateTo, type, visualization, width, height, maxCloud } = parsed.data;
    const evalscript = EVALSCRIPTS[visualization];

    const requestBody = {
      input: {
        bounds: {
          bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
          properties: { crs: 'http://www.opengis.net/def/crs/EPSG/0/4326' },
        },
        data: [{
          type,
          dataFilter: {
            timeRange: { from: `${dateFrom}T00:00:00Z`, to: `${dateTo}T23:59:59Z` },
            ...(type === 'sentinel-2-l2a' ? { maxCloudCoverage: maxCloud } : {}),
          },
        }],
      },
      output: {
        width,
        height,
        responses: [{ identifier: 'default', format: { type: 'image/png' } }],
      },
      evalscript,
    };

    const imgRes = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!imgRes.ok) {
      const errText = await imgRes.text();
      console.error('Sentinel Hub process error:', errText);
      return NextResponse.json({ error: 'Sentinel Hub processing failed' }, { status: 502 });
    }

    const imageBuffer = await imgRes.arrayBuffer();
    return new NextResponse(imageBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('Sentinel route error:', error);
    return NextResponse.json({ error: 'Satellite imagery request failed' }, { status: 500 });
  }
}
