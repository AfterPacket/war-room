'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Settings, Globe, ShieldAlert } from 'lucide-react';
import { HeaderClock } from './HeaderClock';
import { GlobalClockStrip } from './GlobalClockStrip';
import { useSettingsStore } from '@/lib/store/useSettingsStore';

const AI_PROVIDERS = ['claude', 'openai', 'gemini'];
const API_SERVICES = ['claude', 'openai', 'gemini', 'mapbox', 'newsapi', 'gnews'];

export function Header() {
  const { configuredApis, setConfiguredApis, showClockStrip, setShowClockStrip } = useSettingsStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fetch configured services
    fetch('/api/settings/keys')
      .then((r) => r.json())
      .then((d) => { if (d.services) setConfiguredApis(d.services); })
      .catch(() => {});
  }, [setConfiguredApis]);

  const configuredCount = configuredApis.length;
  const totalApis = API_SERVICES.length;

  return (
    <header className="flex-shrink-0">
      {/* Main header row */}
      <div
        className="flex items-center justify-between px-3 border-b"
        style={{
          height: '40px',
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {/* Left: App title */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: configuredCount > 0 ? 'var(--severity-ok)' : 'var(--text-tertiary)' }}
            />
            <span
              className="font-data font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-accent)', fontSize: 'var(--text-lg)', letterSpacing: '0.15em' }}
            >
              WAR ROOM
            </span>
          </div>
        </div>

        {/* Center: Clock */}
        <div className="absolute left-1/2 -translate-x-1/2">
          {mounted && <HeaderClock />}
        </div>

        {/* Right: Status + controls */}
        <div className="flex items-center gap-3">
          {/* AI provider dots */}
          {mounted && (
            <div className="flex items-center gap-1.5">
              {AI_PROVIDERS.map((p) => (
                <div key={p} className="flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full"
                    style={{
                      backgroundColor: configuredApis.includes(p)
                        ? 'var(--severity-ok)'
                        : 'var(--text-tertiary)',
                    }}
                  />
                  <span
                    className="font-data uppercase"
                    style={{
                      color: configuredApis.includes(p) ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                      fontSize: '10px',
                    }}
                  >
                    {p === 'claude' ? 'CLAUDE' : p === 'openai' ? 'GPT' : 'GEM'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* API count */}
          {mounted && (
            <span
              className="font-data"
              style={{
                color: configuredCount >= 3 ? 'var(--severity-ok)' : configuredCount > 0 ? 'var(--severity-high)' : 'var(--text-tertiary)',
                fontSize: '11px',
              }}
            >
              ⚡ {configuredCount}/{totalApis} APIs
            </span>
          )}

          {/* Cyber threat map — open as its own window */}
          <a
            href="/popout/cyber"
            onClick={(e) => {
              e.preventDefault();
              // Try sized popup first; if blocked the href fallback opens a tab
              const w = window.open('/popout/cyber', 'warroom-cyber',
                'width=1400,height=860,resizable=yes,scrollbars=no,location=no,toolbar=no,menubar=no');
              if (!w) window.open('/popout/cyber', '_blank');
            }}
            className="p-1 rounded transition-colors hover:bg-elevated"
            title="Cyber Threat Map"
            rel="noopener noreferrer"
            style={{ color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center' }}
          >
            <ShieldAlert size={14} />
          </a>

          {/* Clock strip toggle */}
          <button
            onClick={() => setShowClockStrip(!showClockStrip)}
            className="p-1 rounded transition-colors hover:bg-elevated"
            title="Toggle world clocks"
            style={{ color: showClockStrip ? 'var(--text-accent)' : 'var(--text-tertiary)' }}
          >
            <Globe size={14} />
          </button>

          {/* Settings link */}
          <Link
            href="/settings"
            className="p-1 rounded transition-colors hover:bg-elevated"
            title="Settings"
            style={{ color: 'var(--text-tertiary)' }}
          >
            <Settings size={14} />
          </Link>
        </div>
      </div>

      {/* Clock strip row */}
      <GlobalClockStrip />
    </header>
  );
}
