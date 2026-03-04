'use client';
import { useState, useEffect } from 'react';
import { useSettingsStore } from '@/lib/store/useSettingsStore';

export function GlobalClockStrip() {
  const { worldClocks, showClockStrip, showFlags } = useSettingsStore();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 10000); // Update every 10s
    return () => clearInterval(interval);
  }, []);

  if (!showClockStrip || !now) return null;

  const utcDate = now.getUTCDate();

  return (
    <div
      className="flex items-center overflow-x-auto border-b"
      style={{
        height: '24px',
        backgroundColor: 'var(--bg-base)',
        borderColor: 'var(--border-subtle)',
        scrollbarWidth: 'none',
      }}
    >
      {worldClocks.map((clock) => {
        const timeStr = now.toLocaleTimeString('en-GB', {
          timeZone: clock.timezone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });

        const localDayStr = now.toLocaleDateString('en-GB', {
          timeZone: clock.timezone,
          day: 'numeric',
        });
        const localDay = parseInt(localDayStr);
        const dayOffset = localDay - utcDate;
        const offsetStr = dayOffset > 0 ? `+${dayOffset}` : dayOffset < 0 ? `${dayOffset}` : '';

        // Dim if nighttime (22-06 local)
        const localHour = parseInt(now.toLocaleTimeString('en-GB', {
          timeZone: clock.timezone, hour: '2-digit', hour12: false,
        }));
        const isNight = localHour >= 22 || localHour < 6;

        return (
          <div
            key={clock.id}
            className="flex items-center gap-1 px-2.5 flex-shrink-0 border-r last:border-r-0"
            style={{ borderColor: 'var(--border-subtle)', opacity: isNight ? 0.6 : 1 }}
          >
            {showFlags && clock.flag && (
              <span style={{ fontSize: '10px' }}>{clock.flag}</span>
            )}
            <span
              className="font-data uppercase"
              style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}
            >
              {clock.label}
            </span>
            <span
              className="font-data"
              style={{ color: 'var(--text-secondary)', fontSize: '11px' }}
            >
              {timeStr}
            </span>
            {offsetStr && (
              <span
                className="font-data"
                style={{ color: 'var(--text-tertiary)', fontSize: '9px' }}
              >
                {offsetStr}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
