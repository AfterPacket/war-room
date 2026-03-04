'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface WorldClock {
  id: string;
  label: string;
  timezone: string;
  flag?: string;
}

export const DEFAULT_WORLD_CLOCKS: WorldClock[] = [
  { id: 'utc',      label: 'UTC',   timezone: 'UTC',                 flag: '🌐' },
  { id: 'dc',       label: 'DC',    timezone: 'America/New_York',    flag: '🇺🇸' },
  { id: 'london',   label: 'LON',   timezone: 'Europe/London',       flag: '🇬🇧' },
  { id: 'kyiv',     label: 'KYIV',  timezone: 'Europe/Kyiv',         flag: '🇺🇦' },
  { id: 'moscow',   label: 'MSK',   timezone: 'Europe/Moscow',       flag: '🇷🇺' },
  { id: 'telaviv',  label: 'TLV',   timezone: 'Asia/Jerusalem',      flag: '🇮🇱' },
  { id: 'tehran',   label: 'THR',   timezone: 'Asia/Tehran',         flag: '🇮🇷' },
  { id: 'beijing',  label: 'BJ',    timezone: 'Asia/Shanghai',       flag: '🇨🇳' },
  { id: 'tokyo',    label: 'TYO',   timezone: 'Asia/Tokyo',          flag: '🇯🇵' },
  { id: 'sydney',   label: 'SYD',   timezone: 'Australia/Sydney',    flag: '🇦🇺' },
];

interface SettingsState {
  // Display
  showClockStrip: boolean;
  showFlags: boolean;
  showScanlines: boolean;
  worldClocks: WorldClock[];
  theme: 'dark-ops' | 'midnight-blue' | 'matrix-green';

  // API status (masked keys stored encrypted server-side)
  configuredApis: string[];

  // AI settings
  activeAiProvider: 'claude' | 'openai' | 'gemini';
  claudeModel: string;
  openaiModel: string;
  geminiModel: string;

  // News settings
  newsRefreshInterval: number;
  newsRegionFocus: string;

  // Map settings
  defaultMapStyle: string;
  defaultMapCenter: [number, number];
  defaultMapZoom: number;
  showSatelliteLayer: boolean;
  showFIRMSLayer: boolean;

  // Actions
  setShowClockStrip: (v: boolean) => void;
  setShowFlags: (v: boolean) => void;
  setShowScanlines: (v: boolean) => void;
  setWorldClocks: (clocks: WorldClock[]) => void;
  setTheme: (t: SettingsState['theme']) => void;
  setActiveAiProvider: (p: SettingsState['activeAiProvider']) => void;
  setClaudeModel: (m: string) => void;
  setOpenaiModel: (m: string) => void;
  setGeminiModel: (m: string) => void;
  setNewsRefreshInterval: (n: number) => void;
  setNewsRegionFocus: (r: string) => void;
  setConfiguredApis: (apis: string[]) => void;
  setDefaultMapStyle: (s: string) => void;
  setDefaultMapCenter: (c: [number, number]) => void;
  setDefaultMapZoom: (z: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      showClockStrip: true,
      showFlags: true,
      showScanlines: false,
      worldClocks: DEFAULT_WORLD_CLOCKS,
      theme: 'dark-ops',
      configuredApis: [],
      activeAiProvider: 'claude',
      claudeModel: 'claude-sonnet-4-6',
      openaiModel: 'gpt-4o',
      geminiModel: 'gemini-2.0-flash',
      newsRefreshInterval: 60,
      newsRegionFocus: 'global',
      defaultMapStyle: 'carto-dark',
      defaultMapCenter: [0, 20],
      defaultMapZoom: 2,
      showSatelliteLayer: false,
      showFIRMSLayer: false,

      setShowClockStrip: (v) => set({ showClockStrip: v }),
      setShowFlags: (v) => set({ showFlags: v }),
      setShowScanlines: (v) => set({ showScanlines: v }),
      setWorldClocks: (clocks) => set({ worldClocks: clocks }),
      setTheme: (t) => set({ theme: t }),
      setActiveAiProvider: (p) => set({ activeAiProvider: p }),
      setClaudeModel: (m) => set({ claudeModel: m }),
      setOpenaiModel: (m) => set({ openaiModel: m }),
      setGeminiModel: (m) => set({ geminiModel: m }),
      setNewsRefreshInterval: (n) => set({ newsRefreshInterval: n }),
      setNewsRegionFocus: (r) => set({ newsRegionFocus: r }),
      setConfiguredApis: (apis) => set({ configuredApis: apis }),
      setDefaultMapStyle: (s) => set({ defaultMapStyle: s }),
      setDefaultMapCenter: (c) => set({ defaultMapCenter: c }),
      setDefaultMapZoom: (z) => set({ defaultMapZoom: z }),
    }),
    { name: 'warroom-settings' }
  )
);
