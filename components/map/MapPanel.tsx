'use client';
import { useEffect, useRef, useState } from 'react';
import { Panel } from '@/components/layout/Panel';
import { MapControls } from './MapControls';
import { useMapStore } from '@/lib/store/useMapStore';
import { GIBS_LAYERS, getMapStyle } from '@/lib/utils/constants';
import { NewsMapLayer } from './NewsMapLayer';
import { AircraftLayer } from './AircraftLayer';
import { ShipLayer } from './ShipLayer';

export function MapPanel() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  // mapReady is a reactive mirror of mapRef.current — refs don't trigger re-renders,
  // so we use state to ensure MapControls is rendered whenever the map is actually ready.
  const [mapReady, setMapReady] = useState(false);
  const [coords, setCoords] = useState({ lng: 0, lat: 0, zoom: 2 });
  // Tracks whether the initial mount has been handled — prevents setTiles() from
  // aborting the tiles that addGIBSLayers() just started on first load.
  const dateInitRef = useRef(false);

  const { mapStyle, activeLayers, imageryDate, setCenter, setZoom, center, zoom } = useMapStore();

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // cancelled flag prevents the async initMap from completing after cleanup
    // (React Strict Mode double-invokes effects; without this a zombie map can
    //  attach to the container and break scroll zoom + other interactions).
    let cancelled = false;
    let map: maplibregl.Map;

    const initMap = async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled) return;

      // Resolve any legacy mapbox:// style IDs to free tile style
      const resolvedStyle = mapStyle.startsWith('mapbox://') ? 'carto-dark' : mapStyle;
      const origin = window.location.origin;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map = new maplibregl.Map({
        container: mapContainer.current!,
        style: getMapStyle(resolvedStyle, origin) as any,
        center: center,
        zoom: zoom,
        renderWorldCopies: false,
        scrollZoom: false, // disabled — handled manually below to work inside overflow:hidden panels
      });

      map.on('load', () => {
        if (cancelled) { map.remove(); return; }
        setIsLoaded(true);
        setMapReady(true);
        addGIBSLayers(map, activeLayers, imageryDate);
      });

      // Manual scroll-to-zoom: MapLibre's native scrollZoom handler doesn't
      // receive wheel events inside overflow:hidden panel chains. We own the
      // wheel event on the container div and drive easeTo() ourselves.
      const container = mapContainer.current!;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        // Normalise pixel vs line delta (Windows wheel mice send deltaMode=1)
        const rawDelta = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
        const zoomDelta = -rawDelta / 450; // matches MapLibre's default rate
        const newZoom = Math.max(0, Math.min(22, map.getZoom() + zoomDelta));
        const rect = container.getBoundingClientRect();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const around = map.unproject([e.clientX - rect.left, e.clientY - rect.top] as any);
        map.easeTo({ zoom: newZoom, around, duration: 0 });
      };
      container.addEventListener('wheel', onWheel, { passive: false });

      map.on('move', () => {
        const c = map.getCenter();
        const z = map.getZoom();
        setCoords({ lng: Math.round(c.lng * 1000) / 1000, lat: Math.round(c.lat * 1000) / 1000, zoom: Math.round(z * 10) / 10 });
      });

      // Save position to store only when the user stops moving (not every frame).
      // This prevents cross-window Zustand persist sync from jumping the map.
      map.on('moveend', () => {
        const c = map.getCenter();
        setCenter([c.lng, c.lat]);
        setZoom(map.getZoom());
      });

      mapRef.current = map;
      // Store cleanup for the wheel listener alongside the map
      (map as any)._wheelCleanup = () => container.removeEventListener('wheel', onWheel);
    };

    initMap();

    return () => {
      cancelled = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapRef.current as any)?._wheelCleanup?.();
      mapRef.current?.remove();
      mapRef.current = null;
      setIsLoaded(false);
      setMapReady(false);
    };
  }, []);

  // Update style — register 'style.load' handler BEFORE calling setStyle so it never misses the event
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    const map = mapRef.current;
    const resolvedStyle = mapStyle.startsWith('mapbox://') ? 'carto-dark' : mapStyle;
    map.once('style.load', () => {
      addGIBSLayers(map, activeLayers, imageryDate);
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    map.setStyle(getMapStyle(resolvedStyle, window.location.origin) as any);
  }, [mapStyle]);

  // Toggle GIBS layer visibility when active layers change
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    toggleLayerVisibility(mapRef.current, activeLayers);
  }, [activeLayers, isLoaded]);

  // Re-fetch GIBS tiles when imagery date changes.
  // Skip on initial mount — addGIBSLayers already uses the correct date and calling
  // setTiles() immediately after would abort those in-flight requests (AbortError).
  useEffect(() => {
    if (!mapRef.current || !isLoaded) return;
    if (!dateInitRef.current) {
      dateInitRef.current = true;
      return;
    }
    updateTileDate(mapRef.current, imageryDate);
  }, [imageryDate, isLoaded]);

  return (
    <Panel title="Satellite Map" panelId="map" noPadding>
      <div className="relative h-full">
        {/* Explicit stacking context isolates MapLibre's internal z-indexes from our overlay controls */}
        <div ref={mapContainer} className="w-full h-full" style={{ position: 'relative', zIndex: 0, touchAction: 'none' }} />

        {/* z-9999 overlay wrapper guarantees controls always paint above MapLibre's
            internal popup stacking contexts (will-change:transform on popups can
            escape a simple z-index:0 isolation boundary).
            pointer-events:none makes the backdrop transparent; interactive children
            opt back in with pointer-events:auto. */}
        {isLoaded && mapReady && (
          <div className="absolute inset-0" style={{ zIndex: 9999, pointerEvents: 'none' }}>
            <MapControls map={mapRef.current!} />
            <NewsMapLayer map={mapRef.current!} />
            <AircraftLayer map={mapRef.current!} />
            <ShipLayer map={mapRef.current!} />
          </div>
        )}

        {/* Coordinates display */}
        <div
          className="absolute bottom-2 left-2 px-2 py-1 font-data"
          style={{
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'var(--text-tertiary)',
            fontSize: '10px',
          }}
        >
          {coords.lng}° {coords.lat}° Z{coords.zoom}
        </div>

        {/* Imagery date badge */}
        <div
          className="absolute bottom-2 right-2 px-2 py-1 font-data"
          style={{
            backgroundColor: 'rgba(0,0,0,0.7)',
            color: 'var(--text-secondary)',
            fontSize: '10px',
          }}
        >
          IMAGERY: {imageryDate}
        </div>

        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: 'var(--bg-surface)' }}>
            <span className="acquiring font-data uppercase" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
              ACQUIRING MAP DATA...
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}

import type maplibregl from 'maplibre-gl';

function addGIBSLayers(map: maplibregl.Map, activeLayers: string[], date: string) {
  for (const layer of GIBS_LAYERS) {
    const isActive = activeLayers.includes(layer.id);
    const sourceId = `gibs-${layer.id}`;
    const layerId = `gibs-layer-${layer.id}`;

    if (!map.getSource(sourceId)) {
      const tileUrl = layer.urlTemplate.replace('{date}', date).replace('{Time}', date);
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        maxzoom: layer.maxZoom,
      });
      map.addLayer({
        id: layerId,
        type: 'raster',
        source: sourceId,
        layout: { visibility: isActive ? 'visible' : 'none' },
        paint: { 'raster-opacity': 0.8 },
      });
    }
  }
}

function toggleLayerVisibility(map: maplibregl.Map, activeLayers: string[]) {
  for (const layer of GIBS_LAYERS) {
    const layerId = `gibs-layer-${layer.id}`;
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', activeLayers.includes(layer.id) ? 'visible' : 'none');
    }
  }
}

function updateTileDate(map: maplibregl.Map, date: string) {
  for (const layer of GIBS_LAYERS) {
    const sourceId = `gibs-${layer.id}`;
    const src = map.getSource(sourceId);
    if (!src) continue;
    const tileUrl = layer.urlTemplate.replace('{date}', date).replace('{Time}', date);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (src as any).setTiles([tileUrl]);
    } catch {
      // AbortError is expected if the map is mid-render; the next render will pick up the new URL
    }
  }
}
