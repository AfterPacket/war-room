'use client';
import { CyberMap } from '@/components/cyber/CyberMap';

export default function CyberPopout() {
  return (
    <div className="flex flex-col h-dvh" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Title bar matching other popouts */}
      <div
        className="flex items-center justify-between px-3 py-1 flex-shrink-0"
        style={{ backgroundColor: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span className="font-data uppercase tracking-wider" style={{ color: '#ef4444', fontSize: '11px', letterSpacing: '0.15em' }}>
          ⬡ WAR ROOM — CYBER THREAT MAP
        </span>
        <span className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
          LIVE THREAT INTELLIGENCE
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CyberMap />
      </div>
    </div>
  );
}
