'use client';
import { useState, useEffect } from 'react';

export function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  const [showLocal, setShowLocal] = useState(false);

  useEffect(() => {
    setNow(new Date());
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!now) return <span className="font-data text-secondary text-sm">--</span>;

  const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  const utcStr = [
    `${days[now.getUTCDay()]}`,
    `${String(now.getUTCDate()).padStart(2, '0')}`,
    `${months[now.getUTCMonth()]}`,
    `${now.getUTCFullYear()}`,
    '•',
    `${String(now.getUTCHours()).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}:${String(now.getUTCSeconds()).padStart(2, '0')}`,
    'UTC',
  ].join(' ');

  const localTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const localDate = now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const tzAbbr = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const displayStr = showLocal
    ? `${localDate.toUpperCase()} • ${localTime} ${tzAbbr}`
    : utcStr;

  return (
    <button
      onClick={() => setShowLocal((v) => !v)}
      title={showLocal ? `UTC: ${utcStr}` : `Local: ${localTime} ${tzAbbr}`}
      className="font-data text-secondary hover:text-primary transition-colors cursor-pointer select-none"
      style={{ fontSize: 'var(--text-sm)' }}
    >
      {displayStr}
    </button>
  );
}
