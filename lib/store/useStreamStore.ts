'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StreamChannel {
  id: string;
  name: string;
  url: string;
  type: 'youtube' | 'twitch' | 'hls' | 'unknown';
  category: string;
  /** True when stream is proxied via /api/proxy/hls (Nimble/header-protected streams) */
  isProxy?: boolean;
}

export interface StreamTile {
  id: string;
  channel: StreamChannel | null;
  isMuted: boolean;
}

export const DEFAULT_CHANNELS: StreamChannel[] = [
  // US News
  { id: 'cnn',      name: 'CNN',        url: 'https://www.youtube.com/watch?v=JQ84CpvRTXw', type: 'youtube', category: 'US News' },
  { id: 'abc',      name: 'ABC News',   url: 'https://www.youtube.com/watch?v=W1kLsITvgLI', type: 'youtube', category: 'US News' },
  { id: 'nbc',      name: 'NBC News',   url: 'https://www.youtube.com/watch?v=SQ1TFGJOyRk', type: 'youtube', category: 'US News' },
  { id: 'cbsn',     name: 'CBS News',   url: 'https://www.youtube.com/watch?v=4E-iFtUM2kk', type: 'youtube', category: 'US News' },
  // International
  { id: 'bbc',      name: 'BBC World',  url: 'https://www.youtube.com/watch?v=9Auq9mYxFEE', type: 'youtube', category: 'International' },
  { id: 'aljazeera',name: 'Al Jazeera', url: 'https://www.youtube.com/watch?v=Z_Zyg2FcMN8', type: 'youtube', category: 'International' },
  { id: 'france24', name: 'France 24',  url: 'https://www.youtube.com/watch?v=h3MuIUNCCLI', type: 'youtube', category: 'International' },
  { id: 'dw',       name: 'DW News',    url: 'https://www.youtube.com/watch?v=dGCJafl51l8', type: 'youtube', category: 'International' },
  { id: 'nhk',      name: 'NHK World',  url: 'https://www.youtube.com/watch?v=OpHXbsIz0EA', type: 'youtube', category: 'International' },
  // Finance
  { id: 'bloomberg',name: 'Bloomberg',  url: 'https://www.youtube.com/watch?v=dp8PhLsUcFE', type: 'youtube', category: 'Finance' },
  { id: 'cnbc',     name: 'CNBC',       url: 'https://www.youtube.com/watch?v=GWYDKmwWOag', type: 'youtube', category: 'Finance' },
];

// IDs that were in the old DEFAULT_CHANNELS list (for migration deduplication)
const LEGACY_DEFAULT_IDS = new Set([
  'cnn','abc','nbc','cbsn','bbc','aljazeera','france24','dw','nhk',
  'skynews','euronews','cgtn','arirang','bloomberg','cnbc',
]);

interface StreamState {
  gridSize: number; // 1–16, any count
  tiles: StreamTile[];
  activeAudioTileId: string | null;
  channels: StreamChannel[];
  savedCategories: string[];
  /** Auto-rotate audio between tiles on a timer */
  videoAutoRotate: boolean;
  /** Seconds between auto-rotate advances */
  videoRotateInterval: number;

  setGridSize: (size: number) => void;
  addTile: () => void;
  removeTile: () => void;
  swapTileChannels: (id1: string, id2: string) => void;
  setTileChannel: (tileId: string, channel: StreamChannel | null) => void;
  setActiveAudioTile: (tileId: string | null) => void;
  setTileMuted: (tileId: string, muted: boolean) => void;
  addChannel: (channel: StreamChannel) => void;
  removeChannel: (id: string) => void;
  updateChannel: (id: string, data: Partial<StreamChannel>) => void;
  setVideoAutoRotate: (v: boolean) => void;
  setVideoRotateInterval: (n: number) => void;
}

function createDefaultTiles(count: number): StreamTile[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `tile-${i}`,
    channel: DEFAULT_CHANNELS[i] || null,
    isMuted: true,
  }));
}

export const useStreamStore = create<StreamState>()(
  persist(
    (set) => ({
      gridSize: 4,
      tiles: createDefaultTiles(4),
      activeAudioTileId: null,
      channels: DEFAULT_CHANNELS,
      savedCategories: ['US News', 'International', 'Finance', 'Custom'],
      videoAutoRotate: false,
      videoRotateInterval: 60,

      setGridSize: (size) =>
        set((state) => {
          const now = Date.now();
          const newTiles = Array.from({ length: size }, (_, i) => {
            return state.tiles[i] || { id: `tile-${now}-${i}`, channel: null, isMuted: true };
          });
          return { gridSize: size, tiles: newTiles };
        }),

      addTile: () =>
        set((state) => {
          if (state.tiles.length >= 16) return state;
          const id = `tile-${Date.now()}`;
          return {
            gridSize: state.tiles.length + 1,
            tiles: [...state.tiles, { id, channel: null, isMuted: true }],
          };
        }),

      removeTile: () =>
        set((state) => {
          if (state.tiles.length <= 1) return state;
          const removed = state.tiles[state.tiles.length - 1];
          const newTiles = state.tiles.slice(0, -1);
          return {
            gridSize: newTiles.length,
            tiles: newTiles,
            activeAudioTileId: state.activeAudioTileId === removed.id ? null : state.activeAudioTileId,
          };
        }),

      swapTileChannels: (id1, id2) =>
        set((state) => {
          const t1 = state.tiles.find((t) => t.id === id1);
          const t2 = state.tiles.find((t) => t.id === id2);
          if (!t1 || !t2) return state;
          return {
            tiles: state.tiles.map((t) => {
              if (t.id === id1) return { ...t, channel: t2.channel };
              if (t.id === id2) return { ...t, channel: t1.channel };
              return t;
            }),
          };
        }),

      setTileChannel: (tileId, channel) =>
        set((state) => ({
          tiles: state.tiles.map((t) => (t.id === tileId ? { ...t, channel } : t)),
        })),
      setActiveAudioTile: (tileId) =>
        set((state) => ({
          activeAudioTileId: tileId,
          tiles: state.tiles.map((t) => ({ ...t, isMuted: t.id !== tileId })),
        })),
      setTileMuted: (tileId, muted) =>
        set((state) => ({
          tiles: state.tiles.map((t) => (t.id === tileId ? { ...t, isMuted: muted } : t)),
        })),
      addChannel: (channel) =>
        set((state) => ({ channels: [...state.channels, channel] })),
      removeChannel: (id) =>
        set((state) => ({ channels: state.channels.filter((c) => c.id !== id) })),
      updateChannel: (id, data) =>
        set((state) => ({
          channels: state.channels.map((c) => (c.id === id ? { ...c, ...data } : c)),
          // Also patch any live tiles showing this channel so they reload immediately
          tiles: state.tiles.map((t) =>
            t.channel?.id === id ? { ...t, channel: { ...t.channel, ...data } } : t
          ),
        })),
      setVideoAutoRotate: (v) => set({ videoAutoRotate: v }),
      setVideoRotateInterval: (n) => set({ videoRotateInterval: n }),
    }),
    {
      name: 'warroom-streams',
      version: 4,
      migrate: (persistedState: unknown, version: number) => {
        const s = persistedState as StreamState & { gridSize?: number };
        if (version < 2) {
          const size = s.gridSize || 4;
          return { ...s, channels: DEFAULT_CHANNELS, tiles: createDefaultTiles(size) };
        }
        if (version < 3) {
          const userChannels = (s.channels || []).filter(
            (c) => !LEGACY_DEFAULT_IDS.has(c.id),
          );
          return { ...s, channels: [...DEFAULT_CHANNELS, ...userChannels] };
        }
        if (version < 4) {
          // Update ABC News URL and patch any tile already showing the old ABC stream
          const newAbcUrl = 'https://www.youtube.com/watch?v=W1kLsITvgLI';
          const channels = (s.channels || []).map((c) =>
            c.id === 'abc' ? { ...c, url: newAbcUrl } : c,
          );
          const tiles = (s.tiles || []).map((t) =>
            t.channel?.id === 'abc' ? { ...t, channel: { ...t.channel, url: newAbcUrl } } : t,
          );
          return { ...s, channels, tiles };
        }
        return s as StreamState;
      },
    }
  )
);
