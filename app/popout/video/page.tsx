'use client';
import { VideoGrid } from '@/components/video/VideoGrid';
import Link from 'next/link';

export default function VideoPopout() {
  return (
    <div className="flex flex-col h-dvh" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div
        className="flex items-center justify-between px-3 py-1 flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span className="font-data uppercase" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          WAR ROOM — VIDEO GRID
        </span>
        <Link href="/" className="font-data uppercase transition-colors hover:text-primary" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
          ← Return to Main
        </Link>
      </div>
      <div className="flex-1 overflow-hidden">
        <VideoGrid />
      </div>
    </div>
  );
}
