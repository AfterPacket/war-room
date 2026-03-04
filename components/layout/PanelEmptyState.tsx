import Link from 'next/link';

interface PanelEmptyStateProps {
  icon?: string;
  message: string;
  action?: {
    label: string;
    href: string;
  };
}

export function PanelEmptyState({ icon = '📡', message, action }: PanelEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 select-none">
      <span style={{ fontSize: '32px', opacity: 0.3 }}>{icon}</span>
      <p
        className="text-center max-w-xs"
        style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}
      >
        {message}
      </p>
      {action && (
        <Link
          href={action.href}
          className="transition-colors hover:text-primary"
          style={{ color: 'var(--text-accent)', fontSize: 'var(--text-sm)' }}
        >
          {action.label} →
        </Link>
      )}
    </div>
  );
}
