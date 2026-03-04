'use client';
import { useSettingsStore } from '@/lib/store/useSettingsStore';
import { useEffect } from 'react';

export function DisplayTab() {
  const { showScanlines, setShowScanlines, theme, setTheme, newsRefreshInterval, setNewsRefreshInterval } = useSettingsStore();

  // Apply scanlines class to body
  useEffect(() => {
    if (showScanlines) {
      document.body.classList.add('scanlines');
    } else {
      document.body.classList.remove('scanlines');
    }
  }, [showScanlines]);

  // Apply theme class to body
  useEffect(() => {
    document.body.classList.remove('theme-matrix-green', 'theme-midnight-blue');
    if (theme === 'matrix-green') document.body.classList.add('theme-matrix-green');
    if (theme === 'midnight-blue') document.body.classList.add('theme-midnight-blue');
  }, [theme]);

  return (
    <div className="max-w-xl flex flex-col gap-6">
      {/* Theme */}
      <div>
        <h3 className="font-data uppercase mb-3" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          Theme
        </h3>
        <div className="flex gap-3">
          {(['dark-ops', 'midnight-blue', 'matrix-green'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="flex flex-col items-center gap-2 p-3 transition-colors"
              style={{
                border: `1px solid ${theme === t ? 'var(--text-accent)' : 'var(--border-subtle)'}`,
                backgroundColor: theme === t ? 'var(--bg-elevated)' : 'var(--bg-surface)',
              }}
            >
              <div
                className="w-12 h-8 rounded"
                style={{
                  backgroundColor:
                    t === 'dark-ops' ? '#07080c' :
                    t === 'midnight-blue' ? '#0a0d17' :
                    '#0a0f0a',
                  border: `2px solid ${
                    t === 'dark-ops' ? '#4ade80' :
                    t === 'midnight-blue' ? '#60a5fa' :
                    '#00ff41'
                  }`,
                }}
              />
              <span
                className="font-data uppercase"
                style={{ color: theme === t ? 'var(--text-accent)' : 'var(--text-tertiary)', fontSize: '10px' }}
              >
                {t.replace('-', ' ')}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Effects */}
      <div>
        <h3 className="font-data uppercase mb-3" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          Visual Effects
        </h3>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={showScanlines}
            onChange={(e) => setShowScanlines(e.target.checked)}
            style={{ accentColor: 'var(--text-accent)', width: '14px', height: '14px' }}
          />
          <div>
            <div style={{ color: 'var(--text-primary)', fontSize: '13px' }}>CRT Scanline Effect</div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>Subtle scanline overlay for command center aesthetic. Disabled when prefers-reduced-motion is set.</div>
          </div>
        </label>
      </div>

      {/* Refresh intervals */}
      <div>
        <h3 className="font-data uppercase mb-3" style={{ color: 'var(--text-accent)', fontSize: '11px' }}>
          Auto-Refresh
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <label style={{ color: 'var(--text-primary)', fontSize: '13px' }}>News refresh interval</label>
            <div className="flex items-center gap-2">
              <select
                value={newsRefreshInterval}
                onChange={(e) => setNewsRefreshInterval(parseInt(e.target.value))}
                className="font-data px-2 py-1"
                style={{
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  outline: 'none',
                }}
              >
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={300}>5 minutes</option>
                <option value={600}>10 minutes</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
