import { NextRequest, NextResponse } from 'next/server';

const UA = 'WarRoom/1.0';

// Cache the Planespotters CDN URL per ICAO24 for 1 hour
const _urlCache = new Map<string, { url: string | null; photographer: string | null; ts: number }>();
const TTL = 3_600_000;

export async function GET(request: NextRequest) {
  const icao24 = request.nextUrl.searchParams.get('icao24')?.toLowerCase();
  if (!icao24) return new NextResponse(null, { status: 404 });

  // Resolve CDN URL (cached)
  let cdnUrl: string | null = null;
  let photographer: string | null = null;

  const hit = _urlCache.get(icao24);
  if (hit && Date.now() - hit.ts < TTL) {
    cdnUrl       = hit.url;
    photographer = hit.photographer;
  } else {
    try {
      const res = await fetch(
        `https://api.planespotters.net/pub/photos/hex/${icao24}`,
        { headers: { 'User-Agent': UA }, cache: 'no-store' }
      );
      if (res.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await res.json() as any;
        const photo = data.photos?.[0];
        cdnUrl       = photo?.thumbnail_large?.src ?? photo?.thumbnail?.src ?? null;
        photographer = photo?.photographer ?? null;
      }
    } catch { /* leave null */ }
    _urlCache.set(icao24, { url: cdnUrl, photographer, ts: Date.now() });
  }

  if (!cdnUrl) return new NextResponse(null, { status: 404 });

  // Proxy the image bytes — adds correct Referer so CDN doesn't block us
  try {
    const imgRes = await fetch(cdnUrl, {
      headers: {
        'User-Agent': UA,
        'Referer':    'https://www.planespotters.net/',
      },
    });
    if (!imgRes.ok) return new NextResponse(null, { status: 404 });

    const bytes       = await imgRes.arrayBuffer();
    const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';

    return new NextResponse(bytes, {
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=3600',
        'X-Photographer': photographer ?? '',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
