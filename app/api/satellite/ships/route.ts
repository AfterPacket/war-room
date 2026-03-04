import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';

export const runtime = 'nodejs'; // required — AISHub uses plain http://

// ── Types ────────────────────────────────────────────────────────────────────

export type ShipType = 'cargo' | 'tanker' | 'military' | 'passenger' | 'fishing' | 'other';

export interface ShipFeature {
  lat:           number;
  lon:           number;
  mmsi:          string;
  name:          string;
  type:          ShipType;
  course:        number;        // COG degrees, 0 = N, clockwise
  speed:         number;        // knots
  heading:       number;        // true heading (falls back to COG)
  time_position: number | null; // unix timestamp of position fix
  imo:           string | null;
  destination:   string | null;
  length:        number | null; // metres (dim A + B)
}

// ── AIS ship type code → our category ────────────────────────────────────────

function aisTypeToCategory(t: number): ShipType {
  if (t >= 70 && t <= 79) return 'cargo';
  if (t >= 80 && t <= 89) return 'tanker';
  if (t === 35 || t === 36 || t === 55) return 'military';
  if (t >= 60 && t <= 69) return 'passenger';
  if (t === 30 || t === 31 || t === 32) return 'fishing';
  return 'other';
}

// Parse AIS timestamp strings like "2024-03-01 14:22:00" → unix seconds
function parseAisTime(raw: unknown): number | null {
  if (!raw) return null;
  const s = String(raw).replace(' ', 'T');
  const ms = Date.parse(s.endsWith('Z') ? s : s + 'Z');
  return isNaN(ms) ? null : Math.floor(ms / 1000);
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let _cache: { data: ShipFeature[]; source: string; ts: number } | null = null;
const CACHE_TTL = 180_000; // 3 minutes

// ── Fetch: MyShipTracking ─────────────────────────────────────────────────────

async function fetchMyShipTracking(key: string): Promise<ShipFeature[]> {
  const url =
    'https://api.myshiptracking.com/api/v2/ais/json' +
    '?msgtype=vessel&bbox=-90,-180,90,180';

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`MyShipTracking HTTP ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any[];
  return json.slice(0, 500).map((v) => ({
    lat:           Number(v.lat ?? v.latitude  ?? 0),
    lon:           Number(v.lon ?? v.longitude ?? 0),
    mmsi:          String(v.mmsi ?? ''),
    name:          String(v.name ?? v.shipname ?? 'UNKNOWN'),
    type:          aisTypeToCategory(Number(v.shiptype ?? 0)),
    course:        Number(v.cog ?? v.course ?? 0),
    speed:         Number(v.sog ?? v.speed  ?? 0),
    heading:       Number(v.heading ?? v.cog ?? 0),
    time_position: parseAisTime(v.time ?? v.timestamp ?? v.lastpos),
    imo:           v.imo ? String(v.imo) : null,
    destination:   v.destination ? String(v.destination).trim() || null : null,
    length:        v.length ? Number(v.length) : null,
  }));
}

// ── Fetch: AISHub ─────────────────────────────────────────────────────────────

async function fetchAISHub(username: string): Promise<ShipFeature[]> {
  const url =
    `http://data.aishub.net/ws.php` +
    `?username=${encodeURIComponent(username)}&format=1&output=json&compress=0`;

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`AISHub HTTP ${res.status}`);

  // AISHub returns [{error,username,...}, [vessels...]]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any[];
  if (!Array.isArray(json) || json.length < 2) throw new Error('AISHub bad response');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vessels: any[] = json[1] ?? [];
  return vessels.slice(0, 500).map((v) => {
    const a = Number(v.A ?? 0);
    const b = Number(v.B ?? 0);
    return {
      lat:           Number(v.LAT  ?? 0),
      lon:           Number(v.LON  ?? 0),
      mmsi:          String(v.MMSI ?? ''),
      name:          String(v.NAME ?? 'UNKNOWN'),
      type:          aisTypeToCategory(Number(v.TYPE ?? 0)),
      course:        Number(v.COG  ?? v.HEADING ?? 0),
      speed:         Number(v.SOG  ?? 0),
      heading:       Number(v.HEADING ?? v.COG ?? 0),
      time_position: parseAisTime(v.TIME),
      imo:           v.IMO ? String(v.IMO) : null,
      destination:   v.DEST ? String(v.DEST).trim() || null : null,
      length:        a + b > 0 ? a + b : null,
    };
  });
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:ships`, 4, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json({ features: _cache.data, source: _cache.source, cached: true });
  }

  // Try MyShipTracking first
  try {
    const enc = getApiKey('myshiptracking');
    if (!enc) throw new Error('not configured');
    const key = decryptApiKey(enc);
    const features = await fetchMyShipTracking(key);
    _cache = { data: features, source: 'myshiptracking', ts: Date.now() };
    return NextResponse.json({ features, source: 'myshiptracking', cached: false });
  } catch { /* key not set or upstream failed — fall through */ }

  // Try AISHub
  try {
    const enc = getApiKey('aishub');
    if (!enc) throw new Error('not configured');
    const username = decryptApiKey(enc);
    const features = await fetchAISHub(username);
    _cache = { data: features, source: 'aishub', ts: Date.now() };
    return NextResponse.json({ features, source: 'aishub', cached: false });
  } catch { /* key not set or upstream failed — fall through */ }

  // Return stale cache if available
  if (_cache) {
    return NextResponse.json({ features: _cache.data, source: _cache.source, cached: true, stale: true });
  }

  return NextResponse.json({ features: [], source: 'none', cached: false });
}
