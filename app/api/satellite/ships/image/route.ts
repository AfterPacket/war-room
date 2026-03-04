import { NextRequest, NextResponse } from 'next/server';

const UA = 'WarRoom/1.0';

// Cache resolved CDN URLs for 2 hours per MMSI
const _urlCache = new Map<string, { url: string | null; ts: number }>();
const TTL = 7_200_000;

// MarineTraffic's public vessel photo redirect
function mtPhotoUrl(mmsi: string) {
  return `https://photos.marinetraffic.com/ais/showphoto.aspx?mmsi=${mmsi}&size=thumb`;
}

export async function GET(request: NextRequest) {
  const mmsi = request.nextUrl.searchParams.get('mmsi');
  if (!mmsi || !/^\d{9}$/.test(mmsi)) return new NextResponse(null, { status: 404 });

  // Check URL cache
  const hit = _urlCache.get(mmsi);
  let resolvedUrl: string | null = hit?.url ?? undefined as unknown as null;
  const cacheStale = !hit || Date.now() - hit.ts >= TTL;

  if (cacheStale) {
    // Follow the MarineTraffic redirect to get the real CDN URL
    try {
      const probe = await fetch(mtPhotoUrl(mmsi), {
        headers: { 'User-Agent': UA, 'Referer': 'https://www.marinetraffic.com/' },
        redirect: 'follow',
      });
      const ct = probe.headers.get('content-type') ?? '';
      if (probe.ok && ct.startsWith('image/')) {
        // Already an image — use the final URL
        resolvedUrl = probe.url;
      } else {
        resolvedUrl = null;
      }
    } catch {
      resolvedUrl = null;
    }
    _urlCache.set(mmsi, { url: resolvedUrl, ts: Date.now() });
  }

  if (!resolvedUrl) return new NextResponse(null, { status: 404 });

  // Proxy the image bytes
  try {
    const imgRes = await fetch(resolvedUrl, {
      headers: { 'User-Agent': UA, 'Referer': 'https://www.marinetraffic.com/' },
    });
    if (!imgRes.ok) return new NextResponse(null, { status: 404 });
    const ct = imgRes.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return new NextResponse(null, { status: 404 });

    const bytes = await imgRes.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type':  ct,
        'Cache-Control': 'public, max-age=7200',
      },
    });
  } catch {
    return new NextResponse(null, { status: 502 });
  }
}
