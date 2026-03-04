'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { VideoGrid } from '@/components/video/VideoGrid';
import { MapPanel } from '@/components/map/MapPanel';
import { NewsFeed } from '@/components/news/NewsFeed';
import { BriefingPanel } from '@/components/ai/BriefingPanel';
import { CyberMap } from '@/components/cyber/CyberMap';
import type { GridLayoutProps, Layout as RGLLayout } from 'react-grid-layout';

// Use dynamic import for react-grid-layout to avoid SSR issues
import dynamic from 'next/dynamic';

const GridLayoutBase = dynamic(
  () => import('react-grid-layout').then((m) => m.default),
  { ssr: false }
) as React.ComponentType<GridLayoutProps>;

const DEFAULT_LAYOUT: RGLLayout = [
  { i: 'video',    x: 0, y: 0,  w: 8, h: 12 },
  { i: 'briefing', x: 8, y: 0,  w: 4, h: 12 },
  { i: 'map',      x: 0, y: 12, w: 4, h: 12 },
  { i: 'news',     x: 4, y: 12, w: 4, h: 12 },
  { i: 'cyber',    x: 8, y: 12, w: 4, h: 12 },
];

const PANELS: Record<string, React.ComponentType> = {
  video: VideoGrid,
  map: MapPanel,
  news: NewsFeed,
  briefing: BriefingPanel,
  cyber: CyberMap,
};

export function DashboardGrid() {
  const [layout, setLayout] = useState<RGLLayout>(DEFAULT_LAYOUT);
  const [rowHeight, setRowHeight] = useState(40);
  const [containerWidth, setContainerWidth] = useState(1200);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const updateSize = () => {
      setContainerWidth(window.innerWidth);
      // Non-grid heights: Header(40) + MarketTicker(22) + NewsTicker(28) + Footer(18) = 108px
      // Grid overhead: 23 row-gaps(2px) + top/bottom container padding(2px each) = 50px
      const available = window.innerHeight - 108 - 50;
      setRowHeight(Math.max(20, Math.floor(available / 24)));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('warroom-layout-v2');
      if (saved) setLayout(JSON.parse(saved));
    } catch {}
  }, []);

  const handleLayoutChange = useCallback((newLayout: RGLLayout) => {
    setLayout(newLayout);
    try {
      localStorage.setItem('warroom-layout-v2', JSON.stringify(newLayout));
    } catch {}
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex-1 overflow-hidden">
      <GridLayoutBase
        layout={layout}
        width={containerWidth}
        gridConfig={{ cols: 12, rowHeight, margin: [2, 2], containerPadding: [2, 2] }}
        dragConfig={{ enabled: true, handle: '.panel-drag-handle' }}
        resizeConfig={{ enabled: true, handles: ['se'] }}
        onLayoutChange={handleLayoutChange}
        autoSize
      >
        {layout.map((item) => {
          const PanelComponent = PANELS[item.i];
          if (!PanelComponent) return null;
          return (
            <div key={item.i} className="overflow-hidden">
              <PanelComponent />
            </div>
          );
        })}
      </GridLayoutBase>
    </div>
  );
}
