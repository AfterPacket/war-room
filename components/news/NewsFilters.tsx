'use client';
import { useNewsStore } from '@/lib/store/useNewsStore';

const CATEGORIES = ['all', 'conflict', 'politics', 'economy', 'technology', 'health', 'environment', 'general'];
const SEVERITIES = ['all', 'critical', 'high', 'medium', 'low'];

export function NewsFilters() {
  const { filter, setFilter } = useNewsStore();

  return (
    <div
      className="flex flex-wrap gap-2 px-3 py-2 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      {/* Search */}
      <input
        value={filter.search}
        onChange={(e) => setFilter({ search: e.target.value })}
        placeholder="Search..."
        className="flex-1 min-w-24 px-2 py-1 font-data"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-primary)',
          fontSize: '11px',
          outline: 'none',
        }}
      />

      {/* Severity filter */}
      <select
        value={filter.severity}
        onChange={(e) => setFilter({ severity: e.target.value })}
        className="font-data uppercase px-2 py-1"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          fontSize: '10px',
          outline: 'none',
        }}
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s} style={{ backgroundColor: 'var(--bg-elevated)' }}>
            {s === 'all' ? 'ALL SEVERITY' : s.toUpperCase()}
          </option>
        ))}
      </select>

      {/* Category filter */}
      <select
        value={filter.category}
        onChange={(e) => setFilter({ category: e.target.value })}
        className="font-data uppercase px-2 py-1"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          fontSize: '10px',
          outline: 'none',
        }}
      >
        {CATEGORIES.map((c) => (
          <option key={c} value={c} style={{ backgroundColor: 'var(--bg-elevated)' }}>
            {c === 'all' ? 'ALL TOPICS' : c.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}
