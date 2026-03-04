'use client';
import { useEffect, useRef } from 'react';
import { useMapStore } from '@/lib/store/useMapStore';
import type maplibregl from 'maplibre-gl';
import type { AircraftFeature } from '@/app/api/satellite/aircraft/route';

// ── MapLibre module cache ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mgl: any = null;
async function getMGL() {
  if (!_mgl) _mgl = (await import('maplibre-gl')).default;
  return _mgl;
}

// ── Layer / source IDs ───────────────────────────────────────────────────────
const SRC         = 'aircraft';
const L_DOTS      = 'aircraft-dots';
const TRACK_SRC   = 'aircraft-track';
const TRACK_LAYER = 'aircraft-track-line';

// ── Max positions stored per aircraft for the trail ──────────────────────────
const MAX_TRAIL = 30;

// ── Interpolation interval (ms) ──────────────────────────────────────────────
const INTERP_MS = 2_000;

// ── Altitude → colour ────────────────────────────────────────────────────────
function altColor(alt: number | null): string {
  if (alt == null || alt <= 0) return '#6b7280';
  if (alt > 10_000) return '#bfdbfe';
  if (alt >  6_000) return '#60a5fa';
  if (alt >  3_000) return '#2dd4bf';
  return '#fbbf24';
}

// ── Dead-reckoning: extrapolate [lon, lat] forward from a known fix ──────────
function deadReckon(f: AircraftFeature, nowMs: number): [number, number] {
  if (!f.velocity_ms || !f.time_position || f.velocity_ms < 5) return [f.lon, f.lat];
  const dt = nowMs / 1000 - f.time_position; // seconds
  if (dt < 0 || dt > 600) return [f.lon, f.lat]; // don't project >10 min stale
  const dist    = f.velocity_ms * dt;            // metres
  const bearing = (f.heading * Math.PI) / 180;
  const R       = 6_371_000;
  const lat2    = f.lat + (dist * Math.cos(bearing) / R) * (180 / Math.PI);
  const lon2    = f.lon + (dist * Math.sin(bearing) / (R * Math.cos((f.lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lon2, lat2];
}

// ── Build GeoJSON from features, optionally interpolating positions ───────────
function toGeoJSON(features: AircraftFeature[], nowMs?: number) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => {
      const [lon, lat] = nowMs ? deadReckon(f, nowMs) : [f.lon, f.lat];
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: {
          callsign:      f.callsign || f.icao24,
          altitude:      f.altitude,
          heading:       f.heading,
          speed:         f.speed,
          velocity_ms:   f.velocity_ms,
          time_position: f.time_position,
          icao24:        f.icao24,
          squawk:        f.squawk,
          country:       f.country,
          color:         altColor(f.altitude),
        },
      };
    }),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function AircraftLayer({ map }: { map: maplibregl.Map }) {
  const showAircraft = useMapStore((s) => s.showAircraft);
  const popupRef     = useRef<maplibregl.Popup | null>(null);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const interpRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const layersOnRef  = useRef(false);
  // Raw features from last fetch — used for interpolation
  const featuresRef  = useRef<AircraftFeature[]>([]);
  // Per-aircraft position history: icao24 → [[lon,lat], ...]
  const trailRef     = useRef(new Map<string, [number, number][]>());

  // ── Source / layer helpers ─────────────────────────────────────────────────

  function hasSrc(id = SRC)     { try { return !!map.getSource(id); } catch { return false; } }
  function hasLayer(id: string) { try { return !!map.getLayer(id);  } catch { return false; } }

  function addLayers() {
    if (hasSrc()) return;
    try {
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: L_DOTS, type: 'circle', source: SRC,
        paint: {
          'circle-radius':       5,
          'circle-color':        ['get', 'color'],
          'circle-opacity':      0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      });
      layersOnRef.current = true;
    } catch (e) { console.warn('[AircraftLayer] addLayers:', e); }
  }

  function removeLayers() {
    popupRef.current?.remove();
    popupRef.current = null;
    clearTrack();
    try {
      if (hasLayer(L_DOTS)) map.removeLayer(L_DOTS);
      if (hasSrc())         map.removeSource(SRC);
    } catch { /* map may be torn down */ }
    layersOnRef.current = false;
  }

  // ── Trail layer helpers ────────────────────────────────────────────────────

  function addTrackSource() {
    if (hasSrc(TRACK_SRC)) return;
    try {
      map.addSource(TRACK_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: TRACK_LAYER, type: 'line', source: TRACK_SRC,
        paint: {
          'line-color':     '#60a5fa',
          'line-width':     1.5,
          'line-opacity':   0.55,
          'line-dasharray': [4, 3],
        },
      }, L_DOTS); // render below the dots
    } catch { /* ignore */ }
  }

  function clearTrack() {
    try {
      if (hasLayer(TRACK_LAYER)) map.removeLayer(TRACK_LAYER);
      if (hasSrc(TRACK_SRC))    map.removeSource(TRACK_SRC);
    } catch { /* ignore */ }
  }

  function drawTrail(icao24: string) {
    const trail = trailRef.current.get(icao24);
    if (!trail || trail.length < 2) return;
    addTrackSource();
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource(TRACK_SRC) as any).setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: trail }, properties: {} }],
      });
    } catch { /* ignore */ }
  }

  // ── Interpolation loop ─────────────────────────────────────────────────────

  function startInterp() {
    if (interpRef.current) return;
    interpRef.current = setInterval(() => {
      if (!hasSrc() || !featuresRef.current.length) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource(SRC) as any).setData(toGeoJSON(featuresRef.current, Date.now()));
    }, INTERP_MS);
  }

  function stopInterp() {
    if (interpRef.current) { clearInterval(interpRef.current); interpRef.current = null; }
  }

  // ── Data fetch ────────────────────────────────────────────────────────────

  async function fetchAndUpdate() {
    try {
      const res = await fetch('/api/satellite/aircraft');
      if (!res.ok) return;
      const data = await res.json();
      if (!hasSrc()) return;
      const features: AircraftFeature[] = data.features ?? [];

      // Update position trail history
      const now = Date.now();
      for (const f of features) {
        const pos = deadReckon(f, now);
        const trail = trailRef.current.get(f.icao24) ?? [];
        trail.push(pos);
        if (trail.length > MAX_TRAIL) trail.splice(0, trail.length - MAX_TRAIL);
        trailRef.current.set(f.icao24, trail);
      }

      featuresRef.current = features;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource(SRC) as any).setData(toGeoJSON(features, now));
    } catch { /* retry on next interval */ }
  }

  // ── Mount effect: event handlers + style-change resilience ───────────────

  useEffect(() => {
    const onClick = async (
      e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
    ) => {
      if (!e.features?.length) return;
      // Capture synchronously BEFORE any await
      const props  = e.features[0].properties;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const coords = (e.features[0].geometry as any).coordinates as [number, number];
      const cam    = { center: map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };

      const mgl    = await getMGL();
      const altM   = props.altitude != null
        ? `${Math.round(props.altitude).toLocaleString()} m / ${Math.round(props.altitude * 3.281).toLocaleString()} ft`
        : 'N/A';
      const spd    = props.speed != null ? `${Math.round(props.speed)} kts` : 'N/A';
      const color  = props.color || '#60a5fa';
      const squawk = props.squawk || '—';
      const country = props.country || '';

      popupRef.current?.remove();
      clearTrack();

      // Image proxied through our server — set src directly, onerror hides slot
      const imgSrc  = `/api/satellite/aircraft/image?icao24=${encodeURIComponent(props.icao24)}`;
      const imgHTML = `
        <div class="ac-img-slot">
          <img src="${imgSrc}" class="ac-img" alt="${props.callsign || props.icao24}"
               onerror="this.closest('.ac-img-slot').style.display='none'">
        </div>`;

      popupRef.current = new mgl.Popup({
        closeButton: true, closeOnClick: false,
        maxWidth: '280px', offset: 10,
        className: 'ac-popup', focusAfterOpen: false,
      }).setLngLat(coords).setHTML(`
        <div class="acp-wrap">
          ${imgHTML}
          <div class="acp-hdr">
            <span style="color:${color}">✈</span>
            <span class="acp-call">${props.callsign || props.icao24}</span>
            <span class="acp-badge">AIRCRAFT</span>
          </div>
          ${country ? `<div class="acp-country">${country}</div>` : ''}
          <div class="acp-row"><span>Altitude</span><span>${altM}</span></div>
          <div class="acp-row"><span>Speed</span><span>${spd}</span></div>
          <div class="acp-row"><span>Heading</span><span>${Math.round(props.heading)}°</span></div>
          <div class="acp-row"><span>Squawk</span><span>${squawk}</span></div>
          <div class="acp-row"><span>ICAO24</span><span class="acp-mono">${props.icao24}</span></div>
        </div>
      `).addTo(map);

      map.jumpTo(cam);

      // Draw stored trail
      drawTrail(props.icao24);
    };

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };

    const onStyleLoad = () => {
      layersOnRef.current = false;
      if (useMapStore.getState().showAircraft) {
        addLayers();
        fetchAndUpdate();
      }
    };

    map.on('click',      L_DOTS, onClick);
    map.on('mouseenter', L_DOTS, onEnter);
    map.on('mouseleave', L_DOTS, onLeave);
    map.on('style.load',         onStyleLoad);

    return () => {
      map.off('click',      L_DOTS, onClick);
      map.off('mouseenter', L_DOTS, onEnter);
      map.off('mouseleave', L_DOTS, onLeave);
      map.off('style.load',         onStyleLoad);
      stopInterp();
      if (timerRef.current) clearInterval(timerRef.current);
      removeLayers();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle effect ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (showAircraft) {
      addLayers();
      fetchAndUpdate();
      timerRef.current = setInterval(fetchAndUpdate, 30_000);
      startInterp();
    } else {
      stopInterp();
      removeLayers();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [showAircraft]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
