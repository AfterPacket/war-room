import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const response = NextResponse.next();

  // === CONTENT SECURITY POLICY ===
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' https://www.youtube.com https://player.twitch.tv https://api.mapbox.com`,
    `style-src 'self' 'unsafe-inline' https://api.mapbox.com https://unpkg.com https://fonts.googleapis.com`,
    `img-src 'self' data: blob: https://*.mapbox.com https://gibs.earthdata.nasa.gov https://sh.dataspace.copernicus.eu https://firms.modaps.eosdis.nasa.gov https://i.ytimg.com https://*.tile.openstreetmap.org https://api.mapbox.com https://*.basemaps.cartocdn.com https://*.arcgisonline.com`,
    `font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com`,
    `connect-src 'self' https://api.anthropic.com https://api.openai.com https://generativelanguage.googleapis.com https://newsapi.org https://gnews.io https://api.mediastack.com https://api.mapbox.com https://events.mapbox.com https://*.mapbox.com https://gibs.earthdata.nasa.gov https://sh.dataspace.copernicus.eu https://firms.modaps.eosdis.nasa.gov https://api.acleddata.com https://api.gdeltproject.org https://*.basemaps.cartocdn.com https://*.arcgisonline.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com https://api.threatfox.abuse.ch https://ip-api.com https://ipwho.is https://gnews.io`,
    `frame-src https://www.youtube.com https://player.twitch.tv`,
    `worker-src blob: 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);

  // === ADDITIONAL SECURITY HEADERS ===
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  response.headers.set('X-DNS-Prefetch-Control', 'on');

  // === CORS — STRICT SAME-ORIGIN FOR API ROUTES ===
  if (request.nextUrl.pathname.startsWith('/api')) {
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    const allowedOrigin = `${request.nextUrl.protocol}//${host}`;

    if (origin && origin !== allowedOrigin) {
      return new NextResponse('Forbidden: Cross-origin request blocked', { status: 403 });
    }

    response.headers.set('Access-Control-Allow-Origin', allowedOrigin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token, X-Requested-With');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Max-Age', '86400');

    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
