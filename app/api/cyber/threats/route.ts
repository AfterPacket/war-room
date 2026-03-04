import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { getApiKey } from '@/lib/db';
import { decryptApiKey } from '@/lib/security/encryption';

export const runtime = 'nodejs';

// ── Cache (90 s) ───────────────────────────────────────────────────────────────
let _cache: { events: unknown[]; ts: number; source: string } | null = null;
const CACHE_TTL = 90_000;

// Separate 24h cache for GreyNoise Community API (50 lookups/week limit)
let _gnCache: { events: unknown[]; ts: number } | null = null;
const GN_CACHE_TTL = 24 * 3600 * 1000;

// ── Country code → [lat, lon] (for ransomware victim mapping) ─────────────────
const CC: Record<string, [number, number]> = {
  US:[38.9,-77.0], GB:[51.5,-0.1], DE:[52.5,13.4], FR:[48.9,2.3], CA:[45.4,-75.7],
  AU:[-33.9,151.2], JP:[35.7,139.7], IN:[20.6,79.1], BR:[-15.8,-47.9], IT:[41.9,12.5],
  ES:[40.4,-3.7], NL:[52.4,4.9], PL:[52.2,21.0], UA:[50.5,30.5], KR:[37.6,126.9],
  TW:[25.0,121.5], IL:[31.8,35.2], SG:[1.4,103.8], CH:[46.9,7.5], SE:[59.3,18.1],
  BE:[50.5,4.5], AT:[47.5,14.6], DK:[56.3,9.5], NO:[60.5,8.5], FI:[61.9,25.7],
  PT:[39.4,-8.2], CZ:[49.8,15.5], HU:[47.2,19.5], RO:[45.9,24.9], GR:[39.1,21.8],
  MX:[19.4,-99.1], AR:[-34.6,-58.4], CL:[-33.5,-70.7], ZA:[-33.9,18.4],
  SA:[24.7,46.7], AE:[25.2,55.3], TR:[39.9,32.9], RU:[55.7,37.6], CN:[39.9,116.4],
  HK:[22.3,114.2], NZ:[-36.9,174.8], ID:[-6.2,106.8], TH:[13.8,100.5],
  MY:[3.1,101.7], PH:[14.6,121.0], VN:[21.0,105.8], PK:[33.7,73.1], EG:[30.1,31.2],
  NG:[6.5,3.4], KE:[-1.3,36.8], GH:[5.6,-0.2], ZW:[-17.8,31.0],
};

// ── Ransomware group → operator location ──────────────────────────────────────
const RANSOMWARE_ORIGINS: Record<string, { lat: number; lon: number; country: string }> = {
  lockbit:      { lat: 55.75, lon: 37.62, country: 'Russia'      },
  alphv:        { lat: 55.75, lon: 37.62, country: 'Russia'      },
  blackcat:     { lat: 55.75, lon: 37.62, country: 'Russia'      },
  cl0p:         { lat: 50.45, lon: 30.52, country: 'Ukraine'     },
  conti:        { lat: 55.75, lon: 37.62, country: 'Russia'      },
  revil:        { lat: 55.75, lon: 37.62, country: 'Russia'      },
  darkside:     { lat: 55.75, lon: 37.62, country: 'Russia'      },
  blackbasta:   { lat: 55.75, lon: 37.62, country: 'Russia'      },
  ransomhub:    { lat: 55.75, lon: 37.62, country: 'Russia'      },
  medusa:       { lat: 55.75, lon: 37.62, country: 'Russia'      },
  play:         { lat: 55.75, lon: 37.62, country: 'Russia'      },
  akira:        { lat: 55.75, lon: 37.62, country: 'Russia'      },
  hunters:      { lat: 55.75, lon: 37.62, country: 'Russia'      },
  dragonforce:  { lat: 55.75, lon: 37.62, country: 'Russia'      },
  qilin:        { lat: 55.75, lon: 37.62, country: 'Russia'      },
  termite:      { lat: 55.75, lon: 37.62, country: 'Russia'      },
  bianlian:     { lat: 39.90, lon: 116.40, country: 'China'      },
  apt41:        { lat: 39.90, lon: 116.40, country: 'China'      },
  lazarus:      { lat: 39.00, lon: 125.80, country: 'North Korea' },
  kimsuky:      { lat: 39.00, lon: 125.80, country: 'North Korea' },
  muddywater:   { lat: 35.70, lon: 51.40,  country: 'Iran'       },
  charming:     { lat: 35.70, lon: 51.40,  country: 'Iran'       },
  sandworm:     { lat: 55.75, lon: 37.62,  country: 'Russia'     },
  fancy:        { lat: 55.75, lon: 37.62,  country: 'Russia'     },
  cozy:         { lat: 55.75, lon: 37.62,  country: 'Russia'     },
};

function ransomwareOrigin(groupName: string) {
  const key = groupName.toLowerCase().replace(/[^a-z]/g, '');
  for (const [k, v] of Object.entries(RANSOMWARE_ORIGINS)) {
    if (key.includes(k) || k.includes(key.slice(0, 5))) return v;
  }
  return { lat: 55.75 + (Math.random() - 0.5), lon: 37.62 + (Math.random() - 0.5), country: 'Russia' };
}

// ── Target pool ───────────────────────────────────────────────────────────────
const TARGETS = [
  { country: 'USA',         lat: 38.9,  lon: -77.0  },
  { country: 'UK',          lat: 51.5,  lon: -0.1   },
  { country: 'Germany',     lat: 52.5,  lon: 13.4   },
  { country: 'France',      lat: 48.9,  lon: 2.3    },
  { country: 'Japan',       lat: 35.7,  lon: 139.7  },
  { country: 'South Korea', lat: 37.6,  lon: 126.9  },
  { country: 'Australia',   lat: -33.9, lon: 151.2  },
  { country: 'Canada',      lat: 45.4,  lon: -75.7  },
  { country: 'Netherlands', lat: 52.4,  lon: 4.9    },
  { country: 'Italy',       lat: 41.9,  lon: 12.5   },
  { country: 'Spain',       lat: 40.4,  lon: -3.7   },
  { country: 'Brazil',      lat: -15.8, lon: -47.9  },
  { country: 'India',       lat: 28.6,  lon: 77.2   },
  { country: 'Ukraine',     lat: 50.5,  lon: 30.5   },
  { country: 'Taiwan',      lat: 25.0,  lon: 121.5  },
  { country: 'Israel',      lat: 31.8,  lon: 35.2   },
  { country: 'Poland',      lat: 52.2,  lon: 21.0   },
  { country: 'Singapore',   lat: 1.4,   lon: 103.8  },
  { country: 'Switzerland', lat: 46.9,  lon: 7.5    },
  { country: 'Sweden',      lat: 59.3,  lon: 18.1   },
];

function pickTarget(srcCountry: string) {
  const cands = TARGETS.filter((t) => t.country !== srcCountry);
  const t = cands[Math.floor(Math.random() * cands.length)];
  return { lat: t.lat + (Math.random() - 0.5) * 2, lon: t.lon + (Math.random() - 0.5) * 2, country: t.country };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(id); }
}

async function batchGeo(ips: string[]) {
  const res = await fetchWithTimeout(
    'http://ip-api.com/batch?fields=status,query,country,lat,lon,isp',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ips) },
    10_000,
  );
  if (!res.ok) throw new Error(`ip-api ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return res.json() as Promise<any[]>;
}

function parseBlocklistIPs(text: string, limit = 20): string[] {
  const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  return text.split('\n').map((l) => l.trim()).filter((l) => IP_RE.test(l)).slice(0, limit);
}

// ── Source 1: Feodo Tracker — confirmed C2 botnet servers ─────────────────────

const MALWARE_TYPE: Record<string, string> = {
  Emotet:'botnet_cc', QakBot:'botnet_cc', IcedID:'botnet_cc', AsyncRAT:'botnet_cc',
  Dridex:'botnet_cc', TrickBot:'botnet_cc', SystemBC:'botnet_cc', Amadey:'botnet_cc',
  Glupteba:'botnet_cc', NjRAT:'botnet_cc', DarkComet:'botnet_cc', Mozi:'botnet_cc',
  LockBit:'ransomware', BlackCat:'ransomware', Cl0p:'ransomware', BlackBasta:'ransomware',
  Ryuk:'ransomware', Conti:'ransomware', REvil:'ransomware',
  CobaltStrike:'exploit', 'Cobalt Strike':'exploit', Metasploit:'exploit', Sliver:'exploit',
  Mirai:'ddos', XorDDoS:'ddos',
  RedLine:'phishing', Raccoon:'phishing', AgentTesla:'phishing', Formbook:'phishing',
};

async function fetchC2Botnets() {
  const res = await fetchWithTimeout('https://feodotracker.abuse.ch/downloads/ipblocklist.json', { cache: 'no-store' }, 10_000);
  if (!res.ok) throw new Error(`Feodo ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await res.json() as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list: any[] = Array.isArray(data) ? data : (data.blocklist ?? []);
  if (!list.length) throw new Error('Feodo: empty');

  const ips = list.map((r) => String(r.ip_address ?? '')).filter(Boolean).slice(0, 50);
  const geos = await batchGeo(ips);
  const geoMap = new Map(geos.filter((g) => g.status === 'success').map((g) => [g.query, g]));

  return list.flatMap((row) => {
    const geo = geoMap.get(String(row.ip_address ?? ''));
    if (!geo) return [];
    const malware = String(row.malware ?? 'Unknown');
    return [{
      id: `feodo-${row.ip_address}`, type: MALWARE_TYPE[malware] ?? 'botnet_cc', malware,
      source: { ip: row.ip_address, lat: geo.lat, lon: geo.lon, country: geo.country, isp: geo.isp },
      target: pickTarget(geo.country),
      confidence: row.status === 'online' ? 95 : 75, timestamp: new Date().toISOString(),
    }];
  });
}

// ── Source 2: URLhaus — malware distribution servers ──────────────────────────

function urlhausTagToType(tags: string): string {
  const t = tags.toLowerCase();
  if (t.includes('mirai'))                           return 'ddos';
  if (t.includes('ransomware'))                      return 'ransomware';
  if (t.includes('cobalt') || t.includes('sliver')) return 'exploit';
  if (t.includes('phish')  || t.includes('stealer'))return 'phishing';
  if (t.includes('rat')    || t.includes('trojan')) return 'trojan';
  if (t.includes('mozi')   || t.includes('botnet')) return 'botnet_cc';
  return 'malware';
}

async function fetchMalwareURLs() {
  const res = await fetchWithTimeout('https://urlhaus.abuse.ch/downloads/csv_recent/', { cache: 'no-store' }, 12_000);
  if (!res.ok) throw new Error(`URLhaus ${res.status}`);
  const text = await res.text();
  const ipInUrl = /^https?:\/\/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/;
  const seen = new Set<string>();
  const iocs: { ip: string; type: string; malware: string }[] = [];

  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const fields = line.match(/"([^"]*?)"/g)?.map((f) => f.slice(1, -1)) ?? [];
    if (fields.length < 7) continue;
    const m = ipInUrl.exec(fields[2]);
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const tags = fields[6];
    const malware = tags.split(',').map((t) => t.trim())
      .find((t) => /^[A-Za-z][a-zA-Z0-9]{2,}/.test(t) && !['elf','mips','arm','x86','online','32-bit','64-bit'].includes(t.toLowerCase()))
      ?? 'Malware';
    iocs.push({ ip: m[1], type: urlhausTagToType(tags), malware });
    if (iocs.length >= 40) break;
  }
  if (!iocs.length) throw new Error('URLhaus: no IPs');

  const geos = await batchGeo(iocs.map((i) => i.ip));
  return iocs.flatMap((ioc, i) => {
    const geo = geos[i];
    if (!geo || geo.status !== 'success') return [];
    return [{ id: `uh-${ioc.ip}`, type: ioc.type, malware: ioc.malware,
      source: { ip: ioc.ip, lat: geo.lat, lon: geo.lon, country: geo.country, isp: geo.isp },
      target: pickTarget(geo.country), confidence: 80, timestamp: new Date().toISOString() }];
  });
}

// ── Source 3: ransomware.live — confirmed ransomware victims ──────────────────

async function fetchRansomware() {
  const res = await fetchWithTimeout('https://api.ransomware.live/recentvictims', { cache: 'no-store' }, 10_000);
  if (!res.ok) throw new Error(`ransomware.live ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const victims: any[] = await res.json();
  if (!victims.length) throw new Error('ransomware.live: empty');

  const events = [];
  for (const v of victims) {
    const cc     = String(v.country ?? '').toUpperCase();
    const coords = CC[cc];
    if (!coords) continue;
    const group  = String(v.group_name ?? 'Ransomware');
    const origin = ransomwareOrigin(group);
    events.push({
      id:         `rw-${v.website ?? v.post_title ?? Math.random()}`,
      type:       'ransomware',
      malware:    group,
      source:     { ip: '', lat: origin.lat + (Math.random() - 0.5) * 2, lon: origin.lon + (Math.random() - 0.5) * 2, country: origin.country, isp: '' },
      target:     { lat: coords[0] + (Math.random() - 0.5) * 1.5, lon: coords[1] + (Math.random() - 0.5) * 1.5, country: cc },
      confidence: 90,
      timestamp:  String(v.discovered ?? new Date().toISOString()),
    });
    if (events.length >= 25) break;
  }
  if (!events.length) throw new Error('ransomware.live: no mapped victims');
  return events;
}

// ── Source 4: blocklist.de — port scanners ────────────────────────────────────

const SCAN_FEEDS = [
  { url: 'https://lists.blocklist.de/lists/ssh.txt',  port: 22,   label: 'SSH'  },
  { url: 'https://lists.blocklist.de/lists/ftp.txt',  port: 21,   label: 'FTP'  },
  { url: 'https://lists.blocklist.de/lists/sip.txt',  port: 5060, label: 'SIP'  },
  { url: 'https://lists.blocklist.de/lists/mail.txt', port: 25,   label: 'SMTP' },
];

async function fetchPortScans() {
  const feedResults = await Promise.allSettled(
    SCAN_FEEDS.map(async (feed) => {
      const res = await fetchWithTimeout(feed.url, { cache: 'no-store' }, 8_000);
      if (!res.ok) return [] as { ip: string; port: number; label: string }[];
      return parseBlocklistIPs(await res.text(), 12).map((ip) => ({ ip, port: feed.port, label: feed.label }));
    }),
  );
  const seen = new Set<string>();
  const iocs: { ip: string; port: number; label: string }[] = [];
  for (const r of feedResults) {
    if (r.status !== 'fulfilled') continue;
    for (const item of r.value) {
      if (!seen.has(item.ip)) { seen.add(item.ip); iocs.push(item); }
    }
  }
  if (!iocs.length) throw new Error('PortScans: empty');
  const geos = await batchGeo(iocs.map((i) => i.ip));
  return iocs.flatMap((ioc, i) => {
    const geo = geos[i];
    if (!geo || geo.status !== 'success') return [];
    return [{ id: `scan-${ioc.ip}-${ioc.port}`, type: 'portscan',
      malware: `Port ${ioc.port} (${ioc.label})`,
      source: { ip: ioc.ip, lat: geo.lat, lon: geo.lon, country: geo.country, isp: geo.isp },
      target: pickTarget(geo.country), confidence: 85, timestamp: new Date().toISOString() }];
  });
}

// ── Source 5: blocklist.de apache — web application exploits ──────────────────

async function fetchWebExploits() {
  const res = await fetchWithTimeout('https://lists.blocklist.de/lists/apache.txt', { cache: 'no-store' }, 8_000);
  if (!res.ok) throw new Error(`apache list ${res.status}`);
  const ips = parseBlocklistIPs(await res.text(), 20);
  if (!ips.length) throw new Error('WebExploits: empty');
  const geos = await batchGeo(ips);
  return ips.flatMap((ip, i) => {
    const geo = geos[i];
    if (!geo || geo.status !== 'success') return [];
    return [{ id: `exploit-${ip}`, type: 'exploit', malware: 'Web Exploit',
      source: { ip, lat: geo.lat, lon: geo.lon, country: geo.country, isp: geo.isp },
      target: pickTarget(geo.country), confidence: 80, timestamp: new Date().toISOString() }];
  });
}

// ── Source 6: blocklist.de bots — automated phishing/credential bots ──────────

async function fetchPhishingBots() {
  const res = await fetchWithTimeout('https://lists.blocklist.de/lists/bots.txt', { cache: 'no-store' }, 8_000);
  if (!res.ok) throw new Error(`bots list ${res.status}`);
  const ips = parseBlocklistIPs(await res.text(), 20);
  if (!ips.length) throw new Error('PhishingBots: empty');
  const geos = await batchGeo(ips);
  return ips.flatMap((ip, i) => {
    const geo = geos[i];
    if (!geo || geo.status !== 'success') return [];
    return [{ id: `phish-${ip}`, type: 'phishing', malware: 'Credential Bot',
      source: { ip, lat: geo.lat, lon: geo.lon, country: geo.country, isp: geo.isp },
      target: pickTarget(geo.country), confidence: 75, timestamp: new Date().toISOString() }];
  });
}

// ── Source 7: GreyNoise — real-time internet scanner detection ────────────────
// Paid key: uses GNQL bulk query (up to 50 results)
// Community key: enriches up to 5 IPs from other sources (50 lookups/week limit)

function greynoiseTagToType(tags: string[], cves: string[]): string {
  const t = tags.map((x) => x.toLowerCase()).join(' ');
  if (cves.length > 0)                                return 'exploit';
  if (t.includes('ransomware'))                       return 'ransomware';
  if (t.includes('phish') || t.includes('credential')) return 'phishing';
  if (t.includes('ddos') || t.includes('flood'))      return 'ddos';
  if (t.includes('trojan') || t.includes('rat'))      return 'trojan';
  if (t.includes('botnet') || t.includes('c2'))       return 'botnet_cc';
  return 'portscan';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapGNQLEntry(e: any): unknown[] {
  const lat = e.metadata?.latitude  ?? e.metadata?.location?.latitude;
  const lon = e.metadata?.longitude ?? e.metadata?.location?.longitude;
  const country = e.metadata?.country ?? e.metadata?.country_name ?? '';
  if (!lat || !lon) return [];
  const tags: string[] = e.tags ?? [];
  const cves: string[] = e.cve   ?? [];
  const type = greynoiseTagToType(tags, cves);
  const cveLabel = cves.slice(0, 2).join(', ');
  const tagLabel = tags.filter((t) => !['scanner','tor','vpn','cloud'].includes(t.toLowerCase())).slice(0, 2).join(', ');
  const malware  = cveLabel || tagLabel || e.actor || 'Internet Scanner';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ports: number[] = (e.raw_data?.scan ?? []).slice(0, 3).map((s: any) => s.port).filter(Boolean);
  const portLabel = ports.length ? ` [:${ports.join(':')}]` : '';
  return [{ id: `gn-${e.ip}`, type, malware: malware + portLabel,
    source: { ip: e.ip, lat: Number(lat), lon: Number(lon), country, isp: e.metadata?.organization ?? '' },
    target: pickTarget(country), confidence: 92, timestamp: e.last_seen ?? new Date().toISOString() }];
}

interface IPGeo { ip: string; lat: number; lon: number; country: string; isp: string }

async function fetchGreyNoise(fallbackIPs: IPGeo[] = []): Promise<unknown[]> {
  const raw = getApiKey('greynoise');
  if (!raw) throw new Error('GreyNoise: no key configured');
  const apiKey = decryptApiKey(raw);

  // ── Attempt 1: GNQL bulk query (paid/enterprise tier) ─────────────────────
  try {
    const res = await fetchWithTimeout(
      'https://api.greynoise.io/v2/experimental/gnql?query=classification%3Amalicious+last_seen%3A1d&size=50',
      { headers: { key: apiKey } }, 12_000,
    );
    if (res.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await res.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const entries: any[] = data.data ?? [];
      if (entries.length > 0) return entries.flatMap(mapGNQLEntry);
    }
    // 401/403 = community key, fall through. Other errors → propagate.
    if (res.status !== 401 && res.status !== 403) throw new Error(`GreyNoise GNQL ${res.status}`);
  } catch (e: unknown) {
    const msg = (e as Error)?.message ?? '';
    if (!msg.startsWith('GreyNoise GNQL 40')) throw e;
  }

  // ── Attempt 2: Community API (/v3/community/{ip}) ─────────────────────────
  // Rate limit: 50 lookups/week → use a 24h cache and max 5 IPs per cycle.
  if (_gnCache && Date.now() - _gnCache.ts < GN_CACHE_TTL) return _gnCache.events;

  const sample = fallbackIPs.slice(0, 5);
  if (!sample.length) {
    _gnCache = { events: [], ts: Date.now() };
    throw new Error('GreyNoise community: no IPs to enrich');
  }

  const lookups = await Promise.allSettled(
    sample.map(async (geo) => {
      const r = await fetchWithTimeout(
        `https://api.greynoise.io/v3/community/${geo.ip}`,
        { headers: { key: apiKey } }, 6_000,
      );
      if (!r.ok) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = await r.json() as any;
      return { geo, d };
    }),
  );

  const events: unknown[] = [];
  for (const r of lookups) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const { geo, d } = r.value;
    if (!d.noise) continue; // not an internet scanner
    events.push({
      id:         `gn-${geo.ip}`,
      type:       d.classification === 'malicious' ? 'portscan' : 'portscan',
      malware:    d.name ? `${d.name} (GN)` : 'GreyNoise Scanner',
      source:     { ip: geo.ip, lat: geo.lat, lon: geo.lon, country: geo.country, isp: geo.isp },
      target:     pickTarget(geo.country),
      confidence: 95,
      timestamp:  d.last_seen ?? new Date().toISOString(),
    });
  }

  _gnCache = { events, ts: Date.now() };
  if (!events.length) throw new Error('GreyNoise community: no confirmed scanners in sample');
  return events;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${clientIp}:cyber-threats`, 12, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json({ events: _cache.events, count: _cache.events.length, synthetic: false, source: _cache.source, cached: true });
  }

  // Run all non-GN sources first so we can pass scan IPs to GN community API fallback
  const [c2, urlhaus, ransomware, scans, exploits, phishing] = await Promise.allSettled([
    fetchC2Botnets(), fetchMalwareURLs(), fetchRansomware(),
    fetchPortScans(), fetchWebExploits(), fetchPhishingBots(),
  ]);

  // Collect geolocated IPs from port scans for GN community API enrichment
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scanGeos: IPGeo[] = scans.status === 'fulfilled'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (scans.value as any[]).map((e: any) => e.source).filter((s: any) => s?.ip && s?.lat)
    : [];

  const greynoise = await Promise.allSettled([fetchGreyNoise(scanGeos)]);
  const gnResult = greynoise[0];

  const log = (name: string, r: PromiseSettledResult<unknown[]>) =>
    r.status === 'rejected' && console.warn(`[cyber] ${name}:`, (r as PromiseRejectedResult).reason?.message);

  log('Feodo',      c2);
  log('URLhaus',    urlhaus);
  log('Ransomware', ransomware);
  log('PortScans',  scans);
  log('Exploits',   exploits);
  log('Phishing',   phishing);
  log('GreyNoise',  gnResult);

  const sourceNames = ['feodo','urlhaus','ransomware.live','blocklist','blocklist','blocklist','greynoise'];
  const sources = [c2, urlhaus, ransomware, scans, exploits, phishing, gnResult].map((r) =>
    r.status === 'fulfilled' ? r.value : [] as unknown[]
  );

  // Round-robin interleave across all sources for maximum variety
  const merged: unknown[] = [];
  for (let i = 0; merged.length < 100 && i < Math.max(...sources.map((s) => s.length)); i++) {
    for (const src of sources) {
      if (i < src.length && merged.length < 100) merged.push(src[i]);
    }
  }

  if (merged.length === 0) {
    return NextResponse.json({ events: [], count: 0, synthetic: false, source: 'unavailable' }, { status: 503 });
  }

  const activeNames = [...new Set(sourceNames.filter((_, i) => sources[i].length > 0))];
  const src = activeNames.join('+');
  _cache = { events: merged, ts: Date.now(), source: src };
  return NextResponse.json({ events: merged, count: merged.length, synthetic: false, source: src });
}
