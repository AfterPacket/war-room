import { NextRequest, NextResponse } from 'next/server';

// Server-side tile proxy — browser never touches external CDNs directly,
// so ad blockers / corporate firewalls can't interfere.
const PROVIDERS: Record<string, (z: string, x: string, y: string) => string> = {
  'carto-dark':     (z, x, y) => `https://a.basemaps.cartocdn.com/dark_all/${z}/${x}/${y}.png`,
  'carto-voyager':  (z, x, y) => `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  // ESRI uses tile/{z}/{y}/{x} — note y and x are swapped in their URL scheme
  'esri-satellite': (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
  'osm-standard':   (z, x, y) => `https://a.tile.openstreetmap.org/${z}/${x}/${y}.png`,
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await params;
  const [provider, z, x, y] = slug;

  const urlFn = PROVIDERS[provider];
  if (!urlFn || !z || !x || !y) {
    return new NextResponse('Not found', { status: 404 });
  }

  const upstreamUrl = urlFn(z, x, y);

  try {
    const res = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 WarRoom/1.0' },
      // Cache each tile on the server for 1 hour — reduces upstream CDN traffic
      next: { revalidate: 3600 },
    });

    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/png',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return new NextResponse('Upstream fetch failed', { status: 502 });
  }
}
