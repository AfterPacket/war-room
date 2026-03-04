import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';

export const runtime = 'nodejs';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AircraftFeature {
  lat:           number;
  lon:           number;
  callsign:      string;
  altitude:      number | null;  // metres
  heading:       number;         // degrees, 0 = N, clockwise
  speed:         number | null;  // knots (rounded)
  velocity_ms:   number | null;  // raw m/s — used for dead-reckoning
  time_position: number | null;  // unix timestamp of last position fix
  icao24:        string;
  squawk:        string | null;
  country:       string;
}

// ── In-memory cache ──────────────────────────────────────────────────────────

let _cache: { data: AircraftFeature[]; ts: number } | null = null;

// ── Parse all airborne aircraft, cap at 2000 ─────────────────────────────────

function parseStates(states: unknown[][]): AircraftFeature[] {
  const out: AircraftFeature[] = [];

  for (const s of states) {
    const lon = s[5] as number | null;
    const lat = s[6] as number | null;
    if (lon == null || lat == null) continue;
    if (Math.abs(lon) > 180 || Math.abs(lat) > 90) continue;

    const alt = (s[7] as number | null) ?? (s[13] as number | null) ?? 0;

    // Skip only if explicitly on-ground AND has no meaningful altitude
    const onGround = s[8] as boolean;
    if (onGround && alt < 50) continue;
    const vel = s[9] as number | null;

    out.push({
      lat,
      lon,
      callsign:      ((s[1] as string | null) || (s[0] as string)).trim() || (s[0] as string),
      altitude:      alt > 0 ? alt : null,
      heading:       (s[10] as number | null) ?? 0,
      speed:         vel != null ? Math.round(vel * 1.944) : null, // m/s → knots
      velocity_ms:   vel,
      time_position: s[3] as number | null,
      icao24:        s[0] as string,
      squawk:        (s[14] as string | null) || null,
      country:       (s[2] as string | null) || '',
    });
  }

  return out;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:aircraft`, 4, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Optional OpenSky credentials — shortens cache TTL from 5min to 2min
  let authHeader: string | undefined;
  try {
    const enc = getApiKey('opensky');
    if (enc) {
      const key = decryptApiKey(enc);
      const [user, pass] = key.split(':');
      if (user && pass) {
        authHeader = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
      }
    }
  } catch { /* not configured — use anonymous */ }

  const cacheTtl = authHeader ? 120_000 : 300_000;

  if (_cache && Date.now() - _cache.ts < cacheTtl) {
    return NextResponse.json({ features: _cache.data, cached: true, count: _cache.data.length });
  }

  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    let res: Response;
    try {
      res = await fetch('https://opensky-network.org/api/states/all', {
        headers,
        signal: controller.signal,
        cache:  'no-store',
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) throw new Error(`OpenSky HTTP ${res.status}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as any;
    const states = (json.states ?? []) as unknown[][];
    const features = parseStates(states);

    _cache = { data: features, ts: Date.now() };
    return NextResponse.json({ features, cached: false, count: features.length });
  } catch (err) {
    console.error('[aircraft]', (err as Error).message);
    if (_cache) {
      return NextResponse.json({ features: _cache.data, cached: true, stale: true, count: _cache.data.length });
    }
    return NextResponse.json({ features: [], error: 'Upstream unavailable', count: 0 });
  }
}
