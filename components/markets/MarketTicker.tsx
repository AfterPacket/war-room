'use client';
import { useEffect, useState } from 'react';
import type { MarketQuote } from '@/app/api/markets/quotes/route';

// ── Flag emoji lookup ───────────────────────────────────────────────────────

const FLAG: Record<string, string> = {
  US: '🇺🇸', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷', EU: '🇪🇺',
  JP: '🇯🇵', HK: '🇭🇰', CN: '🇨🇳', KR: '🇰🇷', RU: '🇷🇺',
  IN: '🇮🇳', BR: '🇧🇷',
};

// ── Formatters ──────────────────────────────────────────────────────────────

function fmtPrice(p: number): string {
  if (p >= 10_000) return p.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (p >= 1_000)  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return p.toFixed(2);
}

function fmtChange(c: number): string {
  return (c >= 0 ? '+' : '') + c.toFixed(2);
}

function fmtPct(p: number): string {
  return (p >= 0 ? '+' : '') + p.toFixed(2) + '%';
}

function stateLabel(q: MarketQuote): string {
  switch (q.marketState) {
    case 'REGULAR':  return 'OPEN';
    case 'PRE':
    case 'PREPRE':   return 'PRE';
    case 'POST':
    case 'POSTPOST': return 'POST';
    default:         return 'CLOSED';
  }
}

// ── Single market item ──────────────────────────────────────────────────────

function MarketItem({ q, suffix }: { q: MarketQuote; suffix: string }) {
  const up     = (q.change ?? 0) >= 0;
  const color  = up ? '#22c55e' : '#ef4444';
  const label  = stateLabel(q);
  const isLive = label === 'OPEN';

  return (
    <span
      key={`${q.symbol}-${suffix}`}
      className="inline-flex items-center gap-1.5 flex-shrink-0"
      style={{ marginRight: '28px', fontSize: '10px' }}
    >
      {/* Flag */}
      <span style={{ fontSize: '11px', lineHeight: 1 }}>{FLAG[q.flag] ?? '🌐'}</span>

      {/* Name */}
      <span style={{ color: 'var(--text-secondary)', letterSpacing: '0.4px' }}>
        {q.name}
      </span>

      {q.price !== null ? (
        <>
          {/* Price */}
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
            {fmtPrice(q.price)}
          </span>

          {/* Change */}
          {q.change !== null && q.changePercent !== null && (
            <span style={{ color }}>
              {fmtChange(q.change)}&nbsp;({fmtPct(q.changePercent)})
            </span>
          )}

          {/* State badge */}
          <span
            style={{
              fontSize: '7px',
              letterSpacing: '0.8px',
              color:  isLive ? '#22c55e' : 'var(--text-tertiary)',
              border: `1px solid ${isLive ? '#22c55e44' : 'var(--border-subtle)'}`,
              padding: '0 3px',
              lineHeight: '14px',
            }}
          >
            {label}
          </span>
        </>
      ) : (
        <span style={{ fontSize: '8px', color: 'var(--text-tertiary)' }}>OFFLINE</span>
      )}
    </span>
  );
}

// ── Separator between region groups ────────────────────────────────────────

function Sep({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center flex-shrink-0"
      style={{ marginRight: '28px', color: 'var(--text-tertiary)', fontSize: '9px', letterSpacing: '1px' }}
    >
      ◆ {label}
    </span>
  );
}

// ── Region groups ───────────────────────────────────────────────────────────

const REGIONS = [
  { label: 'USA',    flags: ['US']             },
  { label: 'EUROPE', flags: ['GB','DE','FR','EU'] },
  { label: 'ASIA',   flags: ['JP','HK','CN','KR','IN'] },
  { label: 'RUSSIA', flags: ['RU']             },
  { label: 'LATAM',  flags: ['BR']             },
];

function buildItems(quotes: MarketQuote[], suffix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  for (const region of REGIONS) {
    const group = quotes.filter((q) => region.flags.includes(q.flag));
    if (group.length === 0) continue;
    nodes.push(<Sep key={`sep-${region.label}-${suffix}`} label={region.label} />);
    group.forEach((q) => nodes.push(<MarketItem key={`${q.symbol}-${suffix}`} q={q} suffix={suffix} />));
  }
  return nodes;
}

// ── Main component ──────────────────────────────────────────────────────────

export function MarketTicker() {
  const [quotes, setQuotes] = useState<MarketQuote[]>([]);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');

  const load = async () => {
    try {
      const res = await fetch('/api/markets/quotes');
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json();
      if (data.quotes?.length) {
        setQuotes(data.quotes);
        setStatus('ok');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);

  const openCount  = quotes.filter((q) => q.isOpen).length;
  const barStyle: React.CSSProperties = {
    height: '22px',
    backgroundColor: 'var(--bg-base)',
    borderBottom: '1px solid var(--border-subtle)',
    flexShrink: 0,
  };

  if (status === 'loading') {
    return (
      <div className="flex items-center px-3 font-data" style={barStyle}>
        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', letterSpacing: '1px' }}>
          ○ MARKETS ACQUIRING...
        </span>
      </div>
    );
  }

  if (status === 'error' || quotes.length === 0) {
    return (
      <div className="flex items-center px-3 font-data" style={barStyle}>
        <span style={{ fontSize: '9px', color: 'var(--text-tertiary)', letterSpacing: '1px' }}>
          ○ MARKETS OFFLINE
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center overflow-hidden font-data" style={barStyle}>
      {/* Fixed label */}
      <div
        className="flex-shrink-0 flex items-center gap-1 px-2"
        style={{
          height: '100%',
          borderRight: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        <span
          style={{
            fontSize: '8px',
            letterSpacing: '1px',
            color: openCount > 0 ? '#22c55e' : 'var(--text-tertiary)',
          }}
        >
          {openCount > 0 ? '●' : '○'} MKTS
        </span>
      </div>

      {/* Scrolling content — doubled for seamless loop */}
      <div className="flex-1 overflow-hidden" style={{ height: '100%' }}>
        <div
          className="market-ticker-track flex items-center h-full"
          style={{ width: 'max-content' }}
        >
          {buildItems(quotes, 'a')}
          {buildItems(quotes, 'b')}
        </div>
      </div>
    </div>
  );
}
