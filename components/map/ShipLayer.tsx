'use client';
import { useEffect, useRef } from 'react';
import { useMapStore } from '@/lib/store/useMapStore';
import type maplibregl from 'maplibre-gl';
import type { ShipFeature, ShipType } from '@/app/api/satellite/ships/route';

// ── MapLibre module cache ────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mgl: any = null;
async function getMGL() {
  if (!_mgl) _mgl = (await import('maplibre-gl')).default;
  return _mgl;
}

// ── Layer / source IDs ───────────────────────────────────────────────────────
const SRC         = 'ships';
const L_DOTS      = 'ship-dots';
const TRACK_SRC   = 'ship-track';
const TRACK_LAYER = 'ship-track-line';
const MAX_TRAIL   = 30;
const INTERP_MS   = 3_000; // ships move slowly — update every 3 s

// ── Vessel type → colour ─────────────────────────────────────────────────────
const TYPE_COLOR: Record<ShipType, string> = {
  cargo:     '#3b82f6',
  tanker:    '#f97316',
  military:  '#ef4444',
  passenger: '#a855f7',
  fishing:   '#22c55e',
  other:     '#6b7280',
};
function shipColor(type: ShipType): string { return TYPE_COLOR[type] ?? '#6b7280'; }

// ── MMSI → country (MID prefix) ──────────────────────────────────────────────
const MID: Record<number, string> = {
  201:'Albania',202:'Andorra',203:'Austria',205:'Belgium',206:'Belarus',
  207:'Bulgaria',209:'Cyprus',210:'Cyprus',211:'Germany',212:'Cyprus',
  213:'Georgia',214:'Moldova',215:'Malta',219:'Denmark',220:'Denmark',
  224:'Spain',225:'Spain',226:'France',227:'France',228:'France',
  229:'Malta',230:'Finland',231:'Faroe Islands',
  232:'United Kingdom',233:'United Kingdom',234:'United Kingdom',235:'United Kingdom',
  236:'Gibraltar',237:'Greece',238:'Croatia',239:'Greece',240:'Greece',
  241:'Greece',242:'Morocco',244:'Netherlands',245:'Netherlands',246:'Netherlands',
  247:'Italy',248:'Malta',249:'Malta',250:'Ireland',251:'Iceland',
  252:'Liechtenstein',253:'Luxembourg',254:'Monaco',255:'Portugal',
  257:'Norway',258:'Norway',259:'Norway',261:'Poland',262:'Montenegro',
  263:'Portugal',264:'Romania',265:'Sweden',266:'Sweden',269:'Switzerland',
  271:'Turkey',272:'Ukraine',273:'Russia',275:'Latvia',276:'Estonia',
  277:'Lithuania',278:'Slovenia',279:'Serbia',
  303:'USA',316:'Canada',338:'United States',366:'United States',
  367:'United States',368:'United States',369:'United States',
  351:'Panama',352:'Panama',353:'Panama',354:'Panama',355:'Panama',
  370:'Panama',371:'Panama',372:'Panama',373:'Panama',374:'Panama',
  308:'Bahamas',309:'Bahamas',311:'Bahamas',319:'Cayman Islands',
  339:'Jamaica',362:'Trinidad and Tobago',
  403:'Saudi Arabia',408:'Bahrain',412:'China',413:'China',414:'China',
  416:'Taiwan',422:'Iran',425:'Iraq',428:'Israel',431:'Japan',432:'Japan',
  434:'Turkmenistan',438:'Jordan',440:'South Korea',441:'South Korea',
  447:'Kuwait',450:'Lebanon',453:'Macao',461:'Oman',463:'Pakistan',
  466:'Qatar',468:'Syria',470:'UAE',471:'UAE',473:'Yemen',477:'Hong Kong',
  503:'Australia',512:'New Zealand',514:'Cambodia',515:'Cambodia',
  525:'Indonesia',533:'Malaysia',538:'Marshall Islands',548:'Philippines',
  563:'Singapore',564:'Singapore',565:'Singapore',566:'Singapore',
  567:'Thailand',574:'Vietnam',576:'Vanuatu',
  601:'South Africa',605:'Algeria',610:'Benin',612:'Cameroon',
  619:'Ivory Coast',620:'Djibouti',621:'Egypt',625:'Gabon',626:'Ghana',
  629:'Equatorial Guinea',634:'Liberia',636:'Liberia',637:'Liberia',
  638:'Libya',655:'Nigeria',672:'Tunisia',701:'Argentina',710:'Brazil',
  720:'Bolivia',725:'Chile',730:'Colombia',735:'Ecuador',750:'Guyana',
  770:'Uruguay',775:'Venezuela',
};
function mmsiCountry(mmsi: string): string {
  return MID[parseInt(mmsi.substring(0, 3), 10)] ?? '';
}

// ── Dead-reckoning for ships ──────────────────────────────────────────────────
// speed in knots × 0.5144 = m/s
function deadReckon(f: ShipFeature, nowMs: number): [number, number] {
  if (!f.time_position || f.speed < 0.3) return [f.lon, f.lat];
  const dt   = nowMs / 1000 - f.time_position;
  if (dt < 0 || dt > 7200) return [f.lon, f.lat]; // don't project >2h stale
  const dist    = f.speed * 0.5144 * dt;           // metres
  const bearing = (f.course * Math.PI) / 180;
  const R       = 6_371_000;
  const lat2    = f.lat + (dist * Math.cos(bearing) / R) * (180 / Math.PI);
  const lon2    = f.lon + (dist * Math.sin(bearing) / (R * Math.cos((f.lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lon2, lat2];
}

// ── GeoJSON builder ───────────────────────────────────────────────────────────
function toGeoJSON(features: ShipFeature[], nowMs?: number) {
  return {
    type: 'FeatureCollection' as const,
    features: features.map((f) => {
      const [lon, lat] = nowMs ? deadReckon(f, nowMs) : [f.lon, f.lat];
      return {
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: {
          mmsi:          f.mmsi,
          name:          f.name,
          type:          f.type,
          course:        f.course ?? 0,
          heading:       f.heading ?? f.course ?? 0,
          speed:         f.speed,
          time_position: f.time_position,
          imo:           f.imo,
          destination:   f.destination,
          length:        f.length,
          color:         shipColor(f.type),
        },
      };
    }),
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function ShipLayer({ map }: { map: maplibregl.Map }) {
  const showShips   = useMapStore((s) => s.showShips);
  const popupRef    = useRef<maplibregl.Popup | null>(null);
  const timerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const interpRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const layersOnRef = useRef(false);
  const featuresRef = useRef<ShipFeature[]>([]);
  const trailRef    = useRef(new Map<string, [number, number][]>());

  // ── Helpers ───────────────────────────────────────────────────────────────

  function hasSrc(id = SRC)     { try { return !!map.getSource(id); } catch { return false; } }
  function hasLayer(id: string) { try { return !!map.getLayer(id);  } catch { return false; } }

  function addLayers() {
    if (hasSrc()) return;
    try {
      map.addSource(SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: L_DOTS, type: 'circle', source: SRC,
        paint: {
          'circle-radius':       6,
          'circle-color':        ['get', 'color'],
          'circle-opacity':      0.9,
          'circle-stroke-width': 1,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
        },
      });
      layersOnRef.current = true;
    } catch (e) { console.warn('[ShipLayer] addLayers:', e); }
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

  // ── Trail ─────────────────────────────────────────────────────────────────

  function addTrackSource() {
    if (hasSrc(TRACK_SRC)) return;
    try {
      map.addSource(TRACK_SRC, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: TRACK_LAYER, type: 'line', source: TRACK_SRC,
        paint: {
          'line-color':     '#60a5fa',
          'line-width':     1.5,
          'line-opacity':   0.5,
          'line-dasharray': [4, 3],
        },
      }, L_DOTS);
    } catch { /* ignore */ }
  }

  function clearTrack() {
    try {
      if (hasLayer(TRACK_LAYER)) map.removeLayer(TRACK_LAYER);
      if (hasSrc(TRACK_SRC))    map.removeSource(TRACK_SRC);
    } catch { /* ignore */ }
  }

  function drawTrail(mmsi: string) {
    const trail = trailRef.current.get(mmsi);
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

  // ── Interpolation loop ────────────────────────────────────────────────────

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
      const res = await fetch('/api/satellite/ships');
      if (!res.ok) return;
      const data = await res.json();
      if (!hasSrc()) return;
      const features: ShipFeature[] = data.features ?? [];

      // Record interpolated position in trail history
      const now = Date.now();
      for (const f of features) {
        const pos   = deadReckon(f, now);
        const trail = trailRef.current.get(f.mmsi) ?? [];
        trail.push(pos);
        if (trail.length > MAX_TRAIL) trail.splice(0, trail.length - MAX_TRAIL);
        trailRef.current.set(f.mmsi, trail);
      }

      featuresRef.current = features;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (map.getSource(SRC) as any).setData(toGeoJSON(features, now));
    } catch { /* retry on next interval */ }
  }

  // ── Mount effect ──────────────────────────────────────────────────────────

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

      const mgl     = await getMGL();
      const color   = props.color || '#3b82f6';
      const type    = (props.type as string || 'other').toUpperCase();
      const spd     = props.speed != null ? `${Number(props.speed).toFixed(1)} kts` : 'N/A';
      const course  = `${Math.round(props.course ?? 0)}°`;
      const country = mmsiCountry(props.mmsi || '');
      const imgSrc  = `/api/satellite/ships/image?mmsi=${encodeURIComponent(props.mmsi)}`;

      // Optional fields
      const imoRow  = props.imo    ? `<div class="spc-row"><span>IMO</span><span class="spc-mono">${props.imo}</span></div>` : '';
      const destRow = props.destination
        ? `<div class="spc-row"><span>Destination</span><span>${props.destination}</span></div>` : '';
      const lenRow  = props.length
        ? `<div class="spc-row"><span>Length</span><span>${props.length} m</span></div>` : '';

      popupRef.current?.remove();
      clearTrack();

      popupRef.current = new mgl.Popup({
        closeButton: true, closeOnClick: false,
        maxWidth: '290px', offset: 10,
        className: 'ship-popup', focusAfterOpen: false,
      }).setLngLat(coords).setHTML(`
        <div class="spc-wrap">
          <div class="spc-img-slot">
            <img src="${imgSrc}" class="spc-img" alt="${props.name}"
                 onerror="this.closest('.spc-img-slot').style.display='none'">
          </div>
          <div class="spc-hdr">
            <span style="color:${color}">⚓</span>
            <span class="spc-name">${props.name}</span>
          </div>
          <div class="spc-type" style="color:${color}">${type}${country ? ` · ${country}` : ''}</div>
          <div class="spc-row"><span>Speed</span><span>${spd}</span></div>
          <div class="spc-row"><span>Course</span><span>${course}</span></div>
          ${destRow}
          ${lenRow}
          ${imoRow}
          <div class="spc-row"><span>MMSI</span><span class="spc-mono">${props.mmsi}</span></div>
        </div>
      `).addTo(map);

      map.jumpTo(cam);
      drawTrail(props.mmsi);
    };

    const onEnter = () => { map.getCanvas().style.cursor = 'pointer'; };
    const onLeave = () => { map.getCanvas().style.cursor = ''; };

    const onStyleLoad = () => {
      layersOnRef.current = false;
      if (useMapStore.getState().showShips) {
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
    if (showShips) {
      addLayers();
      fetchAndUpdate();
      timerRef.current = setInterval(fetchAndUpdate, 60_000);
      startInterp();
    } else {
      stopInterp();
      removeLayers();
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [showShips]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
