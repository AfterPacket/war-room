'use client';
import { create } from 'zustand';

export interface NewsItem {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  category: 'conflict' | 'politics' | 'economy' | 'technology' | 'health' | 'environment' | 'sports' | 'general';
  severity: 'critical' | 'high' | 'medium' | 'low';
  region: string;
  lat?: number;
  lon?: number;
}

interface NewsState {
  items: NewsItem[];
  isLoading: boolean;
  lastFetched: number | null;
  filter: {
    category: string;
    severity: string;
    region: string;
    search: string;
  };
  setItems: (items: NewsItem[]) => void;
  addItems: (items: NewsItem[]) => void;
  setLoading: (v: boolean) => void;
  setLastFetched: (t: number) => void;
  setFilter: (f: Partial<NewsState['filter']>) => void;
}

export const useNewsStore = create<NewsState>((set) => ({
  items: [],
  isLoading: false,
  lastFetched: null,
  filter: { category: 'all', severity: 'all', region: 'all', search: '' },

  setItems: (items) => {
    const seen = new Set<string>();
    const unique = items.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
    set({ items: unique });
  },
  addItems: (newItems) =>
    set((state) => {
      const existingIds = new Set(state.items.map((i) => i.id));
      const seen = new Set<string>();
      const unique = newItems.filter((i) => {
        if (existingIds.has(i.id) || seen.has(i.id)) return false;
        seen.add(i.id);
        return true;
      });
      return { items: [...unique, ...state.items].slice(0, 200) };
    }),
  setLoading: (v) => set({ isLoading: v }),
  setLastFetched: (t) => set({ lastFetched: t }),
  setFilter: (f) => set((state) => ({ filter: { ...state.filter, ...f } })),
}));
