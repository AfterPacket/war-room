'use client';
import { useNewsStore } from '@/lib/store/useNewsStore';

export function NewsTicker() {
  const { items } = useNewsStore();
  const urgent = items.filter((i) => i.severity === 'critical' || i.severity === 'high');

  if (urgent.length === 0) return null;

  const tickerText = urgent.map((i) => `${i.severity.toUpperCase()}: ${i.title}`).join('   ///   ');
  // Duplicate for seamless loop
  const fullText = `${tickerText}   ///   ${tickerText}`;

  const isCritical = urgent.some((i) => i.severity === 'critical');

  return (
    <div
      className="flex-shrink-0 flex items-center overflow-hidden relative"
      style={{
        height: '28px',
        backgroundColor: isCritical ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.1)',
        borderTop: `1px solid ${isCritical ? 'var(--severity-critical)' : 'var(--severity-high)'}`,
      }}
    >
      {/* Label */}
      <div
        className="flex-shrink-0 flex items-center px-3 h-full font-data uppercase"
        style={{
          backgroundColor: isCritical ? 'var(--severity-critical)' : 'var(--severity-high)',
          color: '#000',
          fontSize: '10px',
          fontWeight: 700,
          letterSpacing: '0.1em',
          zIndex: 1,
        }}
      >
        {isCritical ? '● BREAKING' : '⚡ ALERT'}
      </div>

      {/* Scrolling text */}
      <div className="flex-1 overflow-hidden relative">
        <div className="ticker-track flex items-center whitespace-nowrap">
          <span
            className="font-data"
            style={{ color: isCritical ? 'var(--severity-critical)' : 'var(--severity-high)', fontSize: '11px' }}
          >
            &nbsp;&nbsp;&nbsp;{fullText}
          </span>
        </div>
      </div>
    </div>
  );
}
