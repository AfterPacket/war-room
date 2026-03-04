/**
 * HLS Proxy — handles Nimble-Streamer and other header-protected HLS streams.
 *
 * Request patterns:
 *   GET /api/proxy/hls?id=STREAM_ID                        — fetch master/media manifest
 *   GET /api/proxy/hls?id=STREAM_ID&url=ENCODED_SEGMENT    — fetch segment or nested manifest
 *
 * All upstream requests are made with the headers stored in the custom_streams DB row,
 * so the browser never sends the actual credentials.  The response m3u8 has all segment
 * and nested-manifest URLs rewritten to go back through this proxy.
 */

import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { isBlockedHostname } from '@/lib/security/ssrf';
import { getCustomStream } from '@/lib/db';

const MANIFEST_TYPES = new Set([
  'application/vnd.apple.mpegurl',
  'application/x-mpegurl',
  'audio/mpegurl',
  'audio/x-mpegurl',
  'text/plain', // some servers incorrectly use this
]);

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  // Higher limit — HLS fetches many segments per minute
  if (!rateLimit(`${ip}:proxy-hls`, 300, 60000)) {
    return new NextResponse('Rate limit exceeded', { status: 429 });
  }

  const { searchParams, origin: reqOrigin } = new URL(request.url);
  const streamId = searchParams.get('id');
  const encodedSegment = searchParams.get('url');

  if (!streamId) {
    return new NextResponse('Missing stream id', { status: 400 });
  }

  const stream = getCustomStream(streamId);
  if (!stream) {
    return new NextResponse('Stream not found', { status: 404 });
  }
  if (!stream.enabled) {
    return new NextResponse('Stream is disabled', { status: 403 });
  }

  // Determine what URL to hit upstream
  let targetUrl: string;
  if (encodedSegment) {
    try {
      targetUrl = decodeURIComponent(encodedSegment);
    } catch {
      return new NextResponse('Invalid segment URL', { status: 400 });
    }
  } else {
    targetUrl = stream.url;
  }

  // SSRF guard
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return new NextResponse('Protocol not allowed', { status: 400 });
    }
    if (isBlockedHostname(parsed.hostname)) {
      return new NextResponse('Blocked host', { status: 403 });
    }
  } catch {
    return new NextResponse('Invalid URL', { status: 400 });
  }

  // Build upstream headers from DB (browser never sees these)
  const upstreamHeaders: Record<string, string> = {
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive',
  };
  if (stream.user_agent) upstreamHeaders['User-Agent'] = stream.user_agent;
  if (stream.referer)    upstreamHeaders['Referer']    = stream.referer;
  if (stream.origin_header) upstreamHeaders['Origin']  = stream.origin_header;
  if (stream.cookies)    upstreamHeaders['Cookie']     = stream.cookies;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(targetUrl, { headers: upstreamHeaders, cache: 'no-store' });
  } catch (err) {
    console.error(`[HLS proxy] fetch error for stream ${streamId}:`, err);
    return new NextResponse('Upstream unreachable', { status: 502 });
  }

  if (!upstreamRes.ok) {
    const hint = upstreamRes.status === 403
      ? ' (session may have expired — re-add the stream with a fresh URL)'
      : upstreamRes.status === 404
      ? ' (segment not found — stream may have ended or URL changed)'
      : '';
    console.warn(`[HLS proxy] upstream ${upstreamRes.status} for ${targetUrl}${hint}`);
    return new NextResponse(`Upstream ${upstreamRes.status}${hint}`, { status: upstreamRes.status });
  }

  const ct = upstreamRes.headers.get('content-type') || '';
  const isManifest =
    MANIFEST_TYPES.has(ct.split(';')[0].trim().toLowerCase()) ||
    targetUrl.split('?')[0].endsWith('.m3u8') ||
    targetUrl.split('?')[0].endsWith('.m3u');

  if (isManifest) {
    const text = await upstreamRes.text();
    const proxyBase = `${reqOrigin}/api/proxy/hls`;
    const rewritten = rewriteManifest(text, targetUrl, streamId, proxyBase);

    return new NextResponse(rewritten, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store',
        'X-Proxy-Stream': streamId,
      },
    });
  }

  // Segment / binary passthrough — stream the body directly
  return new NextResponse(upstreamRes.body, {
    status: 200,
    headers: {
      'Content-Type': ct || 'video/MP2T',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}

// ─── M3U8 URL rewriting ───────────────────────────────────────────────────────

function resolveUrl(rawUrl: string, manifestUrl: string): string {
  try {
    // Absolute URL — use as-is
    new URL(rawUrl);
    return rawUrl;
  } catch {
    // Root-relative
    if (rawUrl.startsWith('/')) {
      const base = new URL(manifestUrl);
      return `${base.protocol}//${base.host}${rawUrl}`;
    }
    // Relative — resolve against manifest directory
    const base = new URL(manifestUrl);
    const dir = base.pathname.split('/').slice(0, -1).join('/') + '/';
    const search = base.search; // preserve query string (nimblesessionid etc.) for index manifests
    return `${base.protocol}//${base.host}${dir}${rawUrl}${search && !rawUrl.includes('?') ? search : ''}`;
  }
}

function proxyUrl(absoluteUrl: string, streamId: string, proxyBase: string): string {
  return `${proxyBase}?id=${streamId}&url=${encodeURIComponent(absoluteUrl)}`;
}

function rewriteManifest(m3u8: string, manifestUrl: string, streamId: string, proxyBase: string): string {
  return m3u8
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();

      // Rewrite URI="..." attributes inside tags (keys, maps, media playlists)
      if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
        return line.replace(/URI="([^"]+)"/g, (_, uri) => {
          const abs = resolveUrl(uri, manifestUrl);
          return `URI="${proxyUrl(abs, streamId, proxyBase)}"`;
        });
      }

      // Skip pure comments and empty lines
      if (trimmed.startsWith('#') || trimmed === '') return line;

      // Bare URL line (segment .ts / nested .m3u8 / .mp4 / .m4s)
      const abs = resolveUrl(trimmed, manifestUrl);
      return proxyUrl(abs, streamId, proxyBase);
    })
    .join('\n');
}
