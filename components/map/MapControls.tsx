'use client';
import { useState } from 'react';
import { Layers, Map as MapIcon, Flame, ChevronDown, ChevronUp, Plus, Minus, Plane, Anchor } from 'lucide-react';
import { useMapStore } from '@/lib/store/useMapStore';
import { GIBS_LAYERS, MAP_STYLES, REGION_PRESETS } from '@/lib/utils/constants';
import { CONFLICT_PRESETS } from '@/lib/store/useMapStore';
import type maplibregl from 'maplibre-gl';

interface MapControlsProps {
  map: maplibregl.Map;
}

export function MapControls({ map }: MapControlsProps) {
  const { mapStyle, activeLayers, imageryDate, toggleLayer, setMapStyle, setImageryDate, setActivePreset, activePreset, showAircraft, setShowAircraft, showShips, setShowShips } = useMapStore();
  const [showLayers, setShowLayers] = useState(false);
  const [showPresets, setShowPresets] = useState(false);

  const handleStyleChange = (style: string) => {
    // Only update Zustand — MapPanel's useEffect watches mapStyle and calls map.setStyle()
    // Calling setStyle here AND in the effect causes a race that breaks the style switch.
    setMapStyle(style);
  };

  const handleRegionJump = (center: [number, number], zoom: number) => {
    const fly = () => map.flyTo({ center, zoom, duration: 1500 });
    // flyTo is ignored if called while a style is still loading
    if (map.isStyleLoaded()) {
      fly();
    } else {
      map.once('style.load', fly);
    }
  };

  const handlePreset = (preset: typeof CONFLICT_PRESETS[0]) => {
    setShowPresets(false);
    if (activePreset === preset.id) {
      // Second click on active preset → deselect and remove its layers
      preset.layers.forEach((l) => {
        if (activeLayers.includes(l)) toggleLayer(l);
      });
      setActivePreset(null);
      return;
    }
    // Guard against calling flyTo before the style is fully loaded
    const fly = () => map.flyTo({ center: preset.center, zoom: preset.zoom, duration: 2000 });
    if (map.isStyleLoaded()) fly();
    else map.once('style.load', fly);

    preset.layers.forEach((l) => {
      if (!activeLayers.includes(l)) toggleLayer(l);
    });
    setActivePreset(preset.id);
  };

  return (
    <>
      {/* Bottom-left: Zoom buttons */}
      <div
        className="absolute bottom-8 left-2 flex flex-col gap-0.5"
        style={{ pointerEvents: 'auto' }}
      >
        <button
          onClick={() => map.zoomIn()}
          className="flex items-center justify-center"
          style={{
            width: 26, height: 26,
            backgroundColor: 'rgba(0,0,0,0.75)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          title="Zoom in"
        >
          <Plus size={12} />
        </button>
        <button
          onClick={() => map.zoomOut()}
          className="flex items-center justify-center"
          style={{
            width: 26, height: 26,
            backgroundColor: 'rgba(0,0,0,0.75)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          title="Zoom out"
        >
          <Minus size={12} />
        </button>
      </div>

      {/* Top-left: Style switcher + regions */}
      <div
        className="absolute top-2 left-2 flex flex-col gap-1"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Map style buttons */}
        <div className="flex gap-1">
          {MAP_STYLES.map((style) => (
            <button
              key={style.id}
              onClick={() => handleStyleChange(style.id)}
              className="px-2 py-1 font-data uppercase"
              style={{
                fontSize: '10px',
                backgroundColor: mapStyle === style.id ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.7)',
                color: mapStyle === style.id ? 'var(--text-accent)' : 'var(--text-secondary)',
                border: `1px solid ${mapStyle === style.id ? 'var(--text-accent)' : 'var(--border-subtle)'}`,
              }}
            >
              {style.name}
            </button>
          ))}
        </div>

        {/* Region quick jump */}
        <div className="flex gap-1 flex-wrap">
          {REGION_PRESETS.map((region) => (
            <button
              key={region.name}
              onClick={() => handleRegionJump(region.center, region.zoom)}
              className="px-2 py-0.5 font-data uppercase"
              style={{
                fontSize: '9px',
                backgroundColor: 'rgba(0,0,0,0.7)',
                color: 'var(--text-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {region.name}
            </button>
          ))}
        </div>
      </div>

      {/* Top-right: Layer toggle + presets */}
      <div
        className="absolute top-2 right-2 flex flex-col gap-1"
        style={{ pointerEvents: 'auto' }}
      >
        {/* Layer toggle button */}
        <div className="relative">
          <button
            onClick={() => { setShowLayers((v) => !v); setShowPresets(false); }}
            className="flex items-center gap-1 px-2 py-1 font-data uppercase"
            style={{
              fontSize: '10px',
              backgroundColor: showLayers ? 'rgba(74,222,128,0.15)' : 'rgba(0,0,0,0.7)',
              color: showLayers ? 'var(--text-accent)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Layers size={10} /> Layers
            {activeLayers.length > 0 && (
              <span
                className="ml-1 px-1 rounded-full"
                style={{ backgroundColor: 'var(--text-accent)', color: 'var(--bg-base)', fontSize: '9px' }}
              >
                {activeLayers.length}
              </span>
            )}
          </button>

          {showLayers && (
            <div
              className="absolute right-0 top-full mt-1 w-52 py-1"
              style={{
                backgroundColor: 'var(--bg-overlay)',
                border: '1px solid var(--border-active)',
              }}
            >
              <div className="px-2 py-1 font-data uppercase" style={{ color: 'var(--text-tertiary)', fontSize: '9px' }}>
                NASA GIBS Layers
              </div>
              {GIBS_LAYERS.map((layer) => (
                <label
                  key={layer.id}
                  className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-elevated"
                >
                  <input
                    type="checkbox"
                    checked={activeLayers.includes(layer.id)}
                    onChange={() => toggleLayer(layer.id)}
                    className="w-3 h-3"
                    style={{ accentColor: 'var(--text-accent)' }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                    {layer.name}
                  </span>
                </label>
              ))}
              {/* Date picker */}
              <div className="px-2 pt-2 pb-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="font-data uppercase mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '9px' }}>
                  Imagery Date
                </div>
                <input
                  type="date"
                  value={imageryDate}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setImageryDate(e.target.value)}
                  className="w-full px-1.5 py-1 font-data"
                  style={{
                    backgroundColor: 'var(--bg-base)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    fontSize: '11px',
                    outline: 'none',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Aircraft toggle */}
        <button
          onClick={() => setShowAircraft(!showAircraft)}
          className="flex items-center gap-1 px-2 py-1 font-data uppercase w-full"
          title="Toggle live aircraft (OpenSky Network)"
          style={{
            fontSize: '10px',
            backgroundColor: showAircraft ? 'rgba(96,165,250,0.15)' : 'rgba(0,0,0,0.7)',
            color: showAircraft ? '#bfdbfe' : 'var(--text-secondary)',
            border: `1px solid ${showAircraft ? '#60a5fa' : 'var(--border-subtle)'}`,
          }}
        >
          <Plane size={10} /> Aircraft
        </button>

        {/* Ship toggle */}
        <button
          onClick={() => setShowShips(!showShips)}
          className="flex items-center gap-1 px-2 py-1 font-data uppercase w-full"
          title="Toggle live ships (AISHub / MyShipTracking)"
          style={{
            fontSize: '10px',
            backgroundColor: showShips ? 'rgba(59,130,246,0.15)' : 'rgba(0,0,0,0.7)',
            color: showShips ? '#3b82f6' : 'var(--text-secondary)',
            border: `1px solid ${showShips ? '#3b82f6' : 'var(--border-subtle)'}`,
          }}
        >
          <Anchor size={10} /> Ships
        </button>

        {/* Conflict zone presets */}
        <div className="relative">
          <button
            onClick={() => { setShowPresets((v) => !v); setShowLayers(false); }}
            className="flex items-center gap-1 px-2 py-1 font-data uppercase w-full"
            style={{
              fontSize: '10px',
              backgroundColor: (showPresets || !!activePreset) ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.7)',
              color: (showPresets || !!activePreset) ? 'var(--severity-critical)' : 'var(--text-secondary)',
              border: `1px solid ${(showPresets || !!activePreset) ? 'var(--severity-critical)' : 'var(--border-subtle)'}`,
            }}
          >
            <Flame size={10} />
            {activePreset
              ? (CONFLICT_PRESETS.find((p) => p.id === activePreset)?.name ?? 'Conflict Zones')
              : 'Conflict Zones'}
          </button>

          {showPresets && (
            <div
              className="absolute right-0 top-full mt-1 w-52 py-1"
              style={{
                backgroundColor: 'var(--bg-overlay)',
                border: '1px solid var(--border-active)',
              }}
            >
              {CONFLICT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePreset(preset)}
                  className="w-full text-left px-3 py-2 hover:bg-elevated transition-colors"
                  style={{
                    color: activePreset === preset.id ? 'var(--severity-critical)' : 'var(--text-secondary)',
                    fontSize: '11px',
                    background: activePreset === preset.id ? 'rgba(239,68,68,0.08)' : undefined,
                  }}
                >
                  {activePreset === preset.id ? `✓ ${preset.name}` : preset.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
