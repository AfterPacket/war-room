'use client';
import { useState, ReactNode } from 'react';
import { Minus, Square, ExternalLink, X } from 'lucide-react';
import { popOutPanel, type PopoutPanelId } from '@/lib/multiscreen/popout';

interface PanelProps {
  title: string;
  children: ReactNode;
  panelId?: PopoutPanelId;
  className?: string;
  controls?: ReactNode;
  onClose?: () => void;
  noPadding?: boolean;
}

export function Panel({ title, children, panelId, className = '', controls, onClose, noPadding }: PanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [showControls, setShowControls] = useState(false);

  return (
    <div
      className={`panel-container flex flex-col h-full ${className}`}
      style={{
        backgroundColor: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '2px',
      }}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      {/* Panel header — drag handle for react-grid-layout */}
      <div
        className="panel-drag-handle flex items-center justify-between flex-shrink-0 px-4 cursor-grab active:cursor-grabbing select-none"
        style={{
          height: '32px',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="font-data uppercase tracking-wider select-none"
          style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}
        >
          {title}
        </span>

        <div
          className="flex items-center gap-1 transition-opacity"
          style={{ opacity: showControls ? 1 : 0 }}
        >
          {controls}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-0.5 rounded transition-colors hover:text-primary"
            style={{ color: 'var(--text-tertiary)' }}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <Minus size={11} />
          </button>
          {panelId && (
            <button
              onClick={() => popOutPanel({ panelId, title, width: 1280, height: 800 })}
              className="p-0.5 rounded transition-colors hover:text-primary"
              style={{ color: 'var(--text-tertiary)' }}
              title="Pop out to new window"
            >
              <ExternalLink size={11} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 rounded transition-colors hover:text-primary"
              style={{ color: 'var(--text-tertiary)' }}
              title="Close panel"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Panel content */}
      {!collapsed && (
        <div className={`flex-1 overflow-hidden ${noPadding ? '' : 'p-4'}`}>
          {children}
        </div>
      )}
    </div>
  );
}
