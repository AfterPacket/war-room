'use client';
import { useEffect } from 'react';
import { NewsTicker } from '@/components/news/NewsTicker';
import { useNewsStore } from '@/lib/store/useNewsStore';
import Link from 'next/link';

export default function TickerPopout() {
  const { setItems } = useNewsStore();

  // Poll for updates
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await fetch('/api/news/fetch?pageSize=30');
        const data = await res.json();
        if (data.items) setItems(data.items);
      } catch {}
    };
    fetchNews();
    const interval = setInterval(fetchNews, 60000);
    return () => clearInterval(interval);
  }, [setItems]);

  return (
    <div
      className="flex flex-col justify-between"
      style={{ height: '100dvh', backgroundColor: 'var(--bg-base)' }}
    >
      <div
        className="flex items-center justify-between px-3 py-1"
        style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span className="font-data uppercase" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          WAR ROOM — BREAKING NEWS TICKER
        </span>
        <Link href="/" className="font-data uppercase transition-colors hover:text-primary" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
          ← Return to Main
        </Link>
      </div>
      <div className="flex-1" />
      <NewsTicker />
    </div>
  );
}
