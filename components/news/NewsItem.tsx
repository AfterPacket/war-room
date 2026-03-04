'use client';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import type { NewsItem as NewsItemType } from '@/lib/store/useNewsStore';

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'var(--severity-critical)',
  high: 'var(--severity-high)',
  medium: 'var(--severity-medium)',
  low: 'var(--severity-low)',
};

const CATEGORY_ICONS: Record<string, string> = {
  conflict: '⚔',
  politics: '🏛',
  economy: '📊',
  technology: '💡',
  health: '🏥',
  environment: '🌍',
  sports: '⚽',
  general: '📰',
};

interface NewsItemProps {
  item: NewsItemType;
}

export function NewsItemCard({ item }: NewsItemProps) {
  const [expanded, setExpanded] = useState(false);

  const timeAgo = (() => {
    try {
      return formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true });
    } catch {
      return item.publishedAt;
    }
  })();

  const isCritical = item.severity === 'critical';

  return (
    <article
      className={`px-3 py-3 border-b cursor-pointer transition-colors hover:bg-elevated ${isCritical ? 'breaking-news' : ''}`}
      style={{ borderColor: 'var(--border-subtle)' }}
      onClick={() => setExpanded((v) => !v)}
    >
      {/* Header row */}
      <div className="flex items-start gap-2">
        <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
          {CATEGORY_ICONS[item.category] || '📰'}
        </span>
        <div className="flex-1 min-w-0">
          <h3
            className="leading-snug"
            style={{ color: 'var(--text-primary)', fontSize: '15px' }}
          >
            {item.title}
          </h3>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span
              className="font-data uppercase px-1 py-0.5 flex-shrink-0"
              style={{
                fontSize: '11px',
                color: SEVERITY_COLORS[item.severity] || 'var(--text-tertiary)',
                border: `1px solid ${SEVERITY_COLORS[item.severity] || 'var(--text-tertiary)'}`,
              }}
            >
              {item.severity}
            </span>
            <span className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
              {item.source}
            </span>
            {item.region && item.region !== 'global' && (
              <span className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                · {item.region}
              </span>
            )}
            <span className="font-data ml-auto" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
              {timeAgo}
            </span>
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && item.description && (
        <div className="mt-2 ml-6">
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.5' }}>
            {item.description}
          </p>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 mt-2 transition-colors hover:text-primary"
            style={{ color: 'var(--text-accent)', fontSize: '12px' }}
          >
            <ExternalLink size={11} /> Read full article
          </a>
        </div>
      )}
    </article>
  );
}
