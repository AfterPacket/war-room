'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Panel } from '@/components/layout/Panel';
import { getMapStyle } from '@/lib/utils/constants';
import type maplibregl from 'maplibre-gl';

// ── Types ──────────────────────────────────────────────────────────────────

interface CyberEvent {
  id: string;
  type: string;
  malware: string;
  source: { ip: string; lat: number; lon: number; country: string; isp: string };
  target: { lat: number; lon: number; country: string };
  confidence: number;
  timestamp: string;
}

interface Arc {
  id: string;
  type: string;
  malware: string;
  srcLon: number; srcLat: number;
  tgtLon: number; tgtLat: number;
  srcCountry: string; tgtCountry: string;
  color: string;
  progress: number;  // negative = delay, 0-1 = traveling, >1 = fading
  opacity: number;
  speed: number;
}

// ── Constants ──────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  ransomware: '#ef4444',
  botnet_cc:  '#f97316',
  phishing:   '#eab308',
  exploit:    '#06b6d4',
  ddos:       '#d946ef',
  malware:    '#f43f5e',
  trojan:     '#a855f7',
  portscan:   '#22d3ee',
};

const LEGEND = Object.entries(TYPE_COLOR);

// Min active arcs before recycling; batch size per recycle
const MIN_ARCS   = 10;
const BATCH_SIZE = 6;

function arcColor(type: string): string {
  const t = type.toLowerCase();
  for (const [k, v] of Object.entries(TYPE_COLOR)) {
    if (t.includes(k)) return v;
  }
  return '#94a3b8';
}

function makeArc(e: CyberEvent, index: number, now: number): Arc {
  return {
    id:         `${e.id}-${now}-${index}`,
    type:       e.type,
    malware:    e.malware,
    srcLon:     e.source.lon,
    srcLat:     e.source.lat,
    tgtLon:     e.target.lon,
    tgtLat:     e.target.lat,
    srcCountry: e.source.country,
    tgtCountry: e.target.country,
    color:      arcColor(e.type),
    progress:   -(index * 0.05),
    opacity:    1,
    speed:      0.003 + Math.random() * 0.004,
  };
}

// ── Bezier helper ──────────────────────────────────────────────────────────

function bezier(
  sx: number, sy: number,
  cx: number, cy: number,
  ex: number, ey: number,
  t: number,
): [number, number] {
  const u = 1 - t;
  return [
    u * u * sx + 2 * u * t * cx + t * t * ex,
    u * u * sy + 2 * u * t * cy + t * t * ey,
  ];
}

// ── Component ─────────────────────────────────────────────────────────────

export function CyberMap() {
  const containerRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const mapRef        = useRef<maplibregl.Map | null>(null);
  const arcsRef       = useRef<Arc[]>([]);
  const rafRef        = useRef<number>(0);
  // Pool of events from last API fetch — used for continuous recycling
  const poolRef       = useRef<CyberEvent[]>([]);
  // Feed entries staged by the RAF loop; flushed to React state every 2s
  const pendingFeedRef = useRef<Arc[]>([]);

  const [isLoaded, setIsLoaded]  = useState(false);
  const [stats,    setStats]     = useState({ total: 0, topSrc: '', topTgt: '', synthetic: false, source: '' });
  const [feed,     setFeed]      = useState<Arc[]>([]);

  // ── Map init ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    // cancelled flag prevents the async init from completing after cleanup.
    // React Strict Mode double-invokes effects; without this a second map
    // instance tries to attach to the same container and throws.
    let cancelled = false;
    let map: maplibregl.Map;

    const init = async () => {
      const mgl = (await import('maplibre-gl')).default;
      if (cancelled) return;
      map = new mgl.Map({
        container: containerRef.current!,
        style: getMapStyle('carto-dark', window.location.origin) as any,
        center: [20, 15],
        zoom: 1.6,
        renderWorldCopies: false,
        attributionControl: false,
      }) as unknown as maplibregl.Map;
      map.on('load', () => {
        if (cancelled) { map.remove(); return; }
        // Force a resize so MapLibre picks up the container's actual dimensions
        // (the container may have been 0px during the async init).
        map.resize();
        setIsLoaded(true);
      });
      mapRef.current = map;
    };
    init();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Canvas sizing ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ro = new ResizeObserver(() => {
      canvas.width  = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    ro.observe(container);
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => ro.disconnect();
  }, []);

  // ── Animation loop ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const canvas = canvasRef.current;
      const map    = mapRef.current;
      if (!canvas || !map) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const now      = Date.now();
      const toRemove: string[] = [];

      // ── Recycle: if active arcs drop low, spawn a new batch from pool ──
      const active = arcsRef.current.filter((a) => a.progress <= 1).length;
      if (active < MIN_ARCS && poolRef.current.length > 0) {
        const pool = poolRef.current;

        // Pick geographically diverse events: avoid repeating same source country
        const usedCountries = new Set<string>();
        const newBatch: Arc[] = [];
        for (let i = 0; i < BATCH_SIZE; i++) {
          const unused = pool.filter((e) => !usedCountries.has(e.source.country));
          const candidates = unused.length > 0 ? unused : pool;
          const e = candidates[Math.floor(Math.random() * candidates.length)];
          usedCountries.add(e.source.country);
          newBatch.push(makeArc(e, i, now));
        }
        arcsRef.current = [...arcsRef.current, ...newBatch];
        // Stage for feed flush (newest first)
        pendingFeedRef.current = [...newBatch, ...pendingFeedRef.current].slice(0, 10);
      }

      for (const arc of arcsRef.current) {
        arc.progress += arc.speed;
        if (arc.progress <= 0) continue;

        const p = Math.min(arc.progress, 1);

        if (arc.progress > 1) {
          arc.opacity = Math.max(0, arc.opacity - 0.018);
          if (arc.opacity <= 0) { toRemove.push(arc.id); continue; }
        }

        const src  = map.project([arc.srcLon, arc.srcLat]);
        const tgt  = map.project([arc.tgtLon, arc.tgtLat]);
        const mx   = (src.x + tgt.x) / 2;
        const my   = (src.y + tgt.y) / 2;
        const dist = Math.hypot(tgt.x - src.x, tgt.y - src.y);
        const cx   = mx;
        const cy   = my - dist * 0.4;

        const alpha = arc.opacity;
        const color = arc.color;

        // Trail
        const steps   = 50;
        const endStep = Math.floor(p * steps);
        if (endStep > 0) {
          ctx.save();
          ctx.globalAlpha = alpha * 0.45;
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1.2;
          ctx.setLineDash([5, 4]);
          ctx.shadowColor = color;
          ctx.shadowBlur  = 3;
          ctx.beginPath();
          const [x0, y0] = bezier(src.x, src.y, cx, cy, tgt.x, tgt.y, 0);
          ctx.moveTo(x0, y0);
          for (let i = 1; i <= endStep; i++) {
            const [x, y] = bezier(src.x, src.y, cx, cy, tgt.x, tgt.y, i / steps);
            ctx.lineTo(x, y);
          }
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Head dot
        if (p < 1) {
          const [hx, hy] = bezier(src.x, src.y, cx, cy, tgt.x, tgt.y, p);
          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.shadowColor = color;
          ctx.shadowBlur  = 10;
          ctx.fillStyle   = '#ffffff';
          ctx.beginPath();
          ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(hx, hy, 1.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Source pulse
        ctx.save();
        ctx.globalAlpha = alpha * 0.85;
        ctx.fillStyle   = color;
        ctx.shadowColor = color;
        ctx.shadowBlur  = 6;
        ctx.beginPath();
        ctx.arc(src.x, src.y, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Impact ring
        if (p >= 0.96) {
          const ring = (now % 1400) / 1400;
          ctx.save();
          ctx.globalAlpha = alpha * (1 - ring) * 0.65;
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1.5;
          ctx.shadowColor = color;
          ctx.shadowBlur  = 6;
          ctx.beginPath();
          ctx.arc(tgt.x, tgt.y, 4 + ring * 16, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.fillStyle   = color;
          ctx.shadowColor = color;
          ctx.shadowBlur  = 10;
          ctx.beginPath();
          ctx.arc(tgt.x, tgt.y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      arcsRef.current = arcsRef.current.filter((a) => !toRemove.includes(a.id));
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isLoaded]);

  // ── Flush pending feed + recompute live stats every 2 s ──────────────
  useEffect(() => {
    const id = setInterval(() => {
      // Feed
      if (pendingFeedRef.current.length > 0) {
        setFeed([...pendingFeedRef.current]);
      }

      // Stats — derive from currently active arcs so they rotate with the animation
      const active = arcsRef.current.filter((a) => a.progress > 0 && a.progress <= 1);
      if (active.length > 0) {
        const srcCount: Record<string, number> = {};
        const tgtCount: Record<string, number> = {};
        for (const a of active) {
          srcCount[a.srcCountry] = (srcCount[a.srcCountry] ?? 0) + 1;
          tgtCount[a.tgtCountry] = (tgtCount[a.tgtCountry] ?? 0) + 1;
        }
        const topSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        const topTgt = Object.entries(tgtCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
        setStats((prev) => ({ ...prev, total: poolRef.current.length, topSrc, topTgt }));
      }
    }, 2000);
    return () => clearInterval(id);
  }, []);

  // ── Data ingestion ─────────────────────────────────────────────────────
  const ingestEvents = useCallback((events: CyberEvent[], synthetic: boolean, source = '') => {
    const now = Date.now();

    // Refresh the pool so recycling uses fresh data
    poolRef.current = events;

    // Build first batch with geographic diversity: interleave events by source country
    // so the visual never clusters on one nation (e.g. many compromised US cloud hosts).
    const byCountry = new Map<string, CyberEvent[]>();
    for (const e of events) {
      const g = byCountry.get(e.source.country) ?? [];
      g.push(e);
      byCountry.set(e.source.country, g);
    }
    const groups = [...byCountry.values()];
    const interleaved: CyberEvent[] = [];
    const maxRounds = Math.ceil(30 / Math.max(groups.length, 1));
    for (let r = 0; r < maxRounds && interleaved.length < 30; r++) {
      for (const g of groups) {
        if (r < g.length && interleaved.length < 30) interleaved.push(g[r]);
      }
    }
    const firstBatch: Arc[] = interleaved.slice(0, 30).map((e, i) => makeArc(e, i, now));
    arcsRef.current = firstBatch;
    pendingFeedRef.current = firstBatch.slice(0, 10);

    // Stats
    const srcCount: Record<string, number> = {};
    const tgtCount: Record<string, number> = {};
    for (const e of events) {
      srcCount[e.source.country] = (srcCount[e.source.country] ?? 0) + 1;
      tgtCount[e.target.country] = (tgtCount[e.target.country] ?? 0) + 1;
    }
    const topSrc = Object.entries(srcCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const topTgt = Object.entries(tgtCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    setStats({ total: events.length, topSrc, topTgt, synthetic, source });
  }, []);

  // ── Fetch loop — every 45 s ────────────────────────────────────────────
  useEffect(() => {
    const load = () =>
      fetch('/api/cyber/threats')
        .then((r) => r.json())
        .then((d) => { if (d.events?.length) ingestEvents(d.events, d.synthetic ?? false, d.source ?? ''); })
        .catch(() => {});

    load();
    const id = setInterval(load, 45_000);
    return () => clearInterval(id);
  }, [ingestEvents]);

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <Panel title="CYBER THREAT MAP" panelId="cyber" noPadding>
      <div className="relative h-full overflow-hidden" style={{ background: '#07080c' }}>
        {/* position: relative must be set explicitly so MapLibre doesn't overwrite it
            and break the w-full h-full sizing (same pattern as MapPanel). */}
        <div
          ref={containerRef}
          className="w-full h-full"
          style={{ position: 'relative', zIndex: 0 }}
        />

        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 10 }}
        />

        {/* Stats bar */}
        <div className="absolute top-2 left-2 flex gap-1.5 flex-wrap font-data" style={{ zIndex: 20 }}>
          {[
            { label: 'EVENTS', val: stats.total || '—' },
            { label: 'TOP SRC', val: stats.topSrc || '—' },
            { label: 'TOP TGT', val: stats.topTgt || '—' },
          ].map(({ label, val }) => (
            <div
              key={label}
              className="px-2 py-0.5"
              style={{
                background: 'rgba(7,8,12,0.85)',
                border: '1px solid #1e2330',
                fontSize: '10px',
              }}
            >
              <span style={{ color: '#4b5563' }}>{label} </span>
              <span style={{ color: '#e8eaed' }}>{val}</span>
            </div>
          ))}
          {stats.total > 0 && (
            <div
              className="px-2 py-0.5"
              style={{
                background: 'rgba(7,8,12,0.85)',
                border: `1px solid ${stats.synthetic ? '#f59e0b55' : '#22c55e55'}`,
                fontSize: '10px',
                color: stats.synthetic ? '#f59e0b' : '#22c55e',
              }}
            >
              {stats.synthetic ? '⚠ SIMULATED' : `● LIVE · ${(stats.source || 'THREATFEED').toUpperCase()}`}
            </div>
          )}
        </div>

        {/* Legend */}
        <div
          className="absolute top-2 right-2 font-data"
          style={{
            background: 'rgba(7,8,12,0.88)',
            border: '1px solid #1e2330',
            padding: '6px 10px',
            zIndex: 20,
          }}
        >
          {LEGEND.map(([type, color]) => (
            <div key={type} className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
              <div
                style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: color,
                  boxShadow: `0 0 5px ${color}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: '#8b919e', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {type.replace('_', ' ')}
              </span>
            </div>
          ))}
        </div>

        {/* Live feed */}
        <div
          className="absolute bottom-2 left-2 font-data"
          style={{
            background: 'rgba(7,8,12,0.88)',
            border: '1px solid #1e2330',
            width: 230,
            zIndex: 20,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '3px 8px',
              borderBottom: '1px solid #1e2330',
              fontSize: 9,
              color: '#555b69',
              letterSpacing: '1px',
            }}
          >
            ● LIVE THREAT FEED
          </div>
          {feed.map((arc) => (
            <div
              key={arc.id}
              className="flex items-center gap-1.5"
              style={{
                padding: '3px 8px',
                borderBottom: '1px solid #1e233033',
                fontSize: 9,
              }}
            >
              <div
                style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: arc.color,
                  boxShadow: `0 0 4px ${arc.color}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ color: arc.color, minWidth: 60 }}>
                {arc.type === 'portscan'
                  ? arc.malware.replace('Port ', ':').replace(' (', ' ').replace(')', '')
                  : arc.type.replace('_', ' ').toUpperCase().slice(0, 11)}
              </span>
              <span style={{ color: '#4b5563', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {arc.srcCountry} → {arc.tgtCountry}
              </span>
            </div>
          ))}
        </div>

        {!isLoaded && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 font-data"
            style={{ background: '#07080c', zIndex: 30 }}
          >
            <div style={{ color: '#ef4444', fontSize: 10, letterSpacing: 3 }}>█ █ █ █ █</div>
            <span style={{ color: '#4b5563', fontSize: 11, letterSpacing: 2 }}>
              ACQUIRING THREAT FEED…
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
