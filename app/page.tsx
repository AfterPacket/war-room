'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { DashboardGrid } from '@/components/layout/DashboardGrid';
import { NewsTicker } from '@/components/news/NewsTicker';
import { MarketTicker } from '@/components/markets/MarketTicker';
import { useSettingsStore } from '@/lib/store/useSettingsStore';

export default function Dashboard() {
  const { showScanlines, theme, setShowClockStrip, showClockStrip, setConfiguredApis } = useSettingsStore();
  const router = useRouter();

  // Sync configured API services from server — on mount AND whenever the tab becomes
  // visible again (e.g. returning from /settings after adding keys).
  useEffect(() => {
    const sync = () =>
      fetch('/api/settings/keys')
        .then((r) => r.json())
        .then((d) => setConfiguredApis(d.services || []))
        .catch(() => {});

    sync();
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [setConfiguredApis]);

  useEffect(() => {
    // Apply scanlines
    if (showScanlines) document.body.classList.add('scanlines');
    else document.body.classList.remove('scanlines');

    // Apply theme
    document.body.classList.remove('theme-matrix-green', 'theme-midnight-blue');
    if (theme === 'matrix-green') document.body.classList.add('theme-matrix-green');
    if (theme === 'midnight-blue') document.body.classList.add('theme-midnight-blue');
  }, [showScanlines, theme]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (isInput) return;

      if (e.key === 's' || e.key === 'S') router.push('/settings');
      if (e.key === 'g' || e.key === 'G') setShowClockStrip(!showClockStrip);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [router, showClockStrip, setShowClockStrip]);

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100dvh',
        backgroundColor: 'var(--bg-base)',
        overflow: 'hidden',
      }}
    >
      {/* Fixed header */}
      <Header />

      {/* Global markets ticker */}
      <MarketTicker />

      {/* Dashboard grid — takes remaining height */}
      <DashboardGrid />

      {/* Breaking news ticker — fixed at bottom */}
      <NewsTicker />

      {/* Footer credit */}
      <div
        className="flex-shrink-0 flex items-center justify-between px-3 font-data"
        style={{
          height: '18px',
          borderTop: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-base)',
        }}
      >
        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', letterSpacing: '0.5px' }}>
          WAR ROOM — AI Situation Room
        </span>
        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', letterSpacing: '0.5px' }}>
          GPL-3.0 ·{' '}
          <a
            href="https://github.com/AfterPacket"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-accent)', textDecoration: 'none' }}
          >
            github.com/AfterPacket
          </a>
        </span>
      </div>
    </div>
  );
}
