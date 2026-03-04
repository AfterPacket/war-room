'use client';
import { useEffect, useRef } from 'react';
import { useNewsStore } from '@/lib/store/useNewsStore';
import { lookupGeo } from '@/lib/utils/geo';
import type maplibregl from 'maplibre-gl';

// ── Visual config ──────────────────────────────────────────────────────────

const CAT_COLOR: Record<string, string> = {
  conflict:    '#ef4444',
  politics:    '#8b5cf6',
  economy:     '#f59e0b',
  technology:  '#06b6d4',
  health:      '#10b981',
  environment: '#84cc16',
  sports:      '#f97316',
  general:     '#6b7280',
};

const CAT_ICON: Record<string, string> = {
  conflict:    '⚔',
  politics:    '🏛',
  economy:     '📊',
  technology:  '💡',
  health:      '🏥',
  environment: '🌍',
  sports:      '⚽',
  general:     '📰',
};

const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cache the maplibre module so we only dynamic-import once per page session
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _mgl: any = null;
async function getMGL() {
  if (!_mgl) _mgl = (await import('maplibre-gl')).default;
  return _mgl;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Deterministic jitter — fully based on article ID, no index parameter.
 *  This guarantees a pin's geographic offset never changes between re-renders,
 *  eliminating the "jump" caused by the old co-location counter resetting each run. */
function jitter(id: string): [number, number] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const dx = ((hash & 0xff)        / 255 - 0.5) * 2.5;
  const dy = (((hash >> 8) & 0xff) / 255 - 0.5) * 2.5;
  return [dx, dy];
}

function resolveCoords(item: ReturnType<typeof useNewsStore.getState>['items'][0]): [number, number] | null {
  // Use stored coords only if they're real (not null-island 0,0)
  const rawLon = item.lon ?? 0;
  const rawLat = item.lat ?? 0;
  if (
    item.lon != null && item.lat != null &&
    Math.abs(rawLon) <= 180 && Math.abs(rawLat) <= 90 &&
    (rawLon !== 0 || rawLat !== 0)
  ) {
    return [rawLon, rawLat];
  }
  // Region field first (AI-categorised, e.g. "Ukraine"), then title
  const byRegion = item.region && item.region !== 'global' ? lookupGeo(item.region) : null;
  return byRegion ?? lookupGeo(item.title);
}

// ── Component ─────────────────────────────────────────────────────────────

interface PinEntry {
  marker: maplibregl.Marker;
  articleId: string;
  publishedAt: string;
}

export function NewsMapLayer({ map }: { map: maplibregl.Map }) {
  const items = useNewsStore((s) => s.items);
  // Keyed by article ID
  const pinsRef  = useRef<Map<string, PinEntry>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Debounce: absorb rapid keyword→AI double-fire on first load
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(async () => {
      try {
        const mgl = await getMGL();
        const pins = pinsRef.current;

        // ── 1. Remove stale pins ─────────────────────────────────────────
        const liveIds = new Set(items.map((i) => i.id));
        const now = Date.now();

        for (const [id, entry] of pins.entries()) {
          const age = now - new Date(entry.publishedAt).getTime();
          if (!liveIds.has(id) || age > MAX_AGE_MS) {
            try { entry.marker.remove(); } catch { /* ignore */ }
            pins.delete(id);
          }
        }

        // ── 2. Add new pins ──────────────────────────────────────────────
        for (const item of items) {
          if (pins.has(item.id)) continue;

          const coords = resolveCoords(item);
          if (!coords) continue;

          const [jx, jy] = jitter(item.id);
          const lon = coords[0] + jx;
          const lat = coords[1] + jy;

          const color    = CAT_COLOR[item.category]  ?? '#6b7280';
          const icon     = CAT_ICON[item.category]   ?? '📰';
          const ago      = timeAgo(item.publishedAt);
          const catLabel = (item.category ?? 'general').toUpperCase();
          const desc     = (item.description ?? '').slice(0, 160);
          // Show the AI-assigned region if it's specific (not global/undefined)
          const regionLabel = item.region && item.region !== 'global'
            ? item.region.toUpperCase()
            : null;

          const safeTitle = item.title
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const safeDesc = desc
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const safeSource = (item.source ?? '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

          // Marker root — MapLibre writes transform:translate(X,Y) directly onto this
          // element to position it on the map. Never touch its transform property or
          // MapLibre's positioning gets wiped and the pin jumps.
          const el = document.createElement('div');
          el.title = item.title;
          el.style.cssText = 'width:26px;height:26px;cursor:pointer;';

          // Inner visual element — safe to scale/animate independently of MapLibre.
          const inner = document.createElement('div');
          inner.style.cssText = [
            'width:26px', 'height:26px',
            `background:${color}18`,
            `border:1.5px solid ${color}`,
            'border-radius:50%',
            'display:flex', 'align-items:center', 'justify-content:center',
            'font-size:13px',
            `box-shadow:0 0 8px ${color}55`,
            'transition:transform .15s,box-shadow .15s',
            'user-select:none',
            'pointer-events:none',
          ].join(';');
          inner.textContent = icon;
          el.appendChild(inner);

          // Prevent pointer/mouse down from bubbling to the map's drag handler.
          // MapLibre v4 uses pointerdown for drag detection, so both must be stopped.
          el.addEventListener('pointerdown', (e) => e.stopPropagation());
          el.addEventListener('mousedown', (e) => e.stopPropagation());
          el.addEventListener('mouseenter', () => {
            inner.style.transform = 'scale(1.4)';
            inner.style.boxShadow = `0 0 20px ${color}bb`;
          });
          el.addEventListener('mouseleave', () => {
            inner.style.transform = '';
            inner.style.boxShadow = `0 0 8px ${color}55`;
          });

          const popup = new mgl.Popup({
            closeButton: true,
            closeOnClick: false,
            maxWidth: '300px',
            offset: 14,
            className: 'news-popup',
            focusAfterOpen: false,
          }).setLngLat([lon, lat]).setHTML(`
            <div class="npi-wrap">
              <div class="npi-header">
                <span class="npi-icon">${icon}</span>
                <span class="npi-cat" style="color:${color}">${catLabel}</span>
                ${regionLabel ? `<span class="npi-cat" style="color:#555b69;margin-left:2px">· ${regionLabel}</span>` : ''}
                <span class="npi-time">${ago}</span>
              </div>
              <div class="npi-title">${safeTitle}</div>
              ${safeDesc ? `<div class="npi-desc">${safeDesc}${(item.description ?? '').length > 160 ? '…' : ''}</div>` : ''}
              <div class="npi-footer">
                <span class="npi-source">${safeSource}</span>
                <a class="npi-link" href="${item.url}" target="_blank" rel="noopener noreferrer" style="color:${color}">READ →</a>
              </div>
            </div>
          `);

          // Handle popup toggle manually so we can lock the camera before
          // MapLibre's auto-pan animation is queued.
          // map.jumpTo() calls easeTo({duration:0}) which internally calls _stop()
          // synchronously — this cancels whatever animation the popup auto-pan
          // scheduled, keeping the map completely still.
          let popupOpen = false;
          popup.on('close', () => { popupOpen = false; });

          el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (popupOpen) {
              popup.remove();
              return;
            }
            const cam = {
              center: map.getCenter(),
              zoom: map.getZoom(),
              bearing: map.getBearing(),
              pitch: map.getPitch(),
            };
            popup.addTo(map);
            // jumpTo cancels any animation queued by popup's auto-pan
            map.jumpTo(cam);
            popupOpen = true;
          });

          const marker = new mgl.Marker({ element: el })
            .setLngLat([lon, lat])
            .addTo(map);

          pins.set(item.id, { marker, articleId: item.id, publishedAt: item.publishedAt });
        }
      } catch (err) {
        console.warn('[NewsMapLayer] pin render error:', err);
      }
    }, 600);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [items, map]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => {
      pinsRef.current.forEach((e) => { try { e.marker.remove(); } catch { /* ignore */ } });
      pinsRef.current.clear();
    };
  }, []);

  return null;
}
