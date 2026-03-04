'use client';
import { useState } from 'react';
import { Loader2, RefreshCw, Download, CheckCircle, AlertCircle } from 'lucide-react';

type Status = 'idle' | 'checking' | 'up-to-date' | 'updates-available' | 'updating' | 'done' | 'error';

export function UpdatesTab() {
  const [status, setStatus] = useState<Status>('idle');
  const [currentCommit, setCurrentCommit] = useState('');
  const [changes, setChanges] = useState<string[]>([]);
  const [updateOutput, setUpdateOutput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  async function checkForUpdates() {
    setStatus('checking');
    setErrorMsg('');
    setChanges([]);
    setUpdateOutput('');
    try {
      const res = await fetch('/api/update');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Check failed');
      setCurrentCommit(data.current);
      setChanges(data.changes);
      setStatus(data.hasUpdates ? 'updates-available' : 'up-to-date');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  async function applyUpdate() {
    setStatus('updating');
    setErrorMsg('');
    try {
      const res = await fetch('/api/update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      setUpdateOutput(data.output);
      setStatus('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  const checking = status === 'checking';
  const updating = status === 'updating';

  return (
    <div style={{ maxWidth: 560 }}>
      <h2
        className="font-data uppercase tracking-widest mb-1"
        style={{ color: 'var(--text-accent)', fontSize: 'var(--text-lg)' }}
      >
        Software Update
      </h2>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginBottom: 24 }}>
        Source: github.com/AfterPacket/war-room &nbsp;·&nbsp; Branch: main
      </p>

      {currentCommit && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: 16 }}>
          Current version: <span style={{ color: 'var(--text-primary)', fontFamily: 'monospace' }}>{currentCommit}</span>
        </p>
      )}

      {/* Check button */}
      <button
        onClick={checkForUpdates}
        disabled={checking || updating}
        className="flex items-center gap-2 px-4 py-2 rounded transition-opacity"
        style={{
          backgroundColor: 'var(--text-accent)',
          color: 'var(--bg-base)',
          fontSize: '13px',
          fontWeight: 600,
          opacity: checking || updating ? 0.6 : 1,
          cursor: checking || updating ? 'not-allowed' : 'pointer',
        }}
      >
        {checking ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        {checking ? 'Checking…' : 'Check for Updates'}
      </button>

      {/* Up to date */}
      {status === 'up-to-date' && (
        <div className="flex items-center gap-2 mt-4" style={{ color: '#4ade80', fontSize: '13px' }}>
          <CheckCircle size={15} /> Up to date
        </div>
      )}

      {/* Updates available */}
      {status === 'updates-available' && (
        <div className="mt-5">
          <p style={{ color: 'var(--text-primary)', fontSize: '13px', marginBottom: 8 }}>
            {changes.length} update{changes.length !== 1 ? 's' : ''} available:
          </p>
          <ul className="mb-5" style={{ paddingLeft: 16, color: 'var(--text-secondary)', fontSize: '12px' }}>
            {changes.map((line, i) => (
              <li key={i} style={{ marginBottom: 4 }}>• {line}</li>
            ))}
          </ul>
          <button
            onClick={applyUpdate}
            disabled={updating}
            className="flex items-center gap-2 px-4 py-2 rounded transition-opacity"
            style={{
              backgroundColor: '#22c55e',
              color: '#000',
              fontSize: '13px',
              fontWeight: 600,
              opacity: updating ? 0.6 : 1,
              cursor: updating ? 'not-allowed' : 'pointer',
            }}
          >
            {updating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {updating ? 'Applying…' : 'Apply Update'}
          </button>
        </div>
      )}

      {/* Done */}
      {status === 'done' && (
        <div className="mt-5">
          <div className="flex items-center gap-2 mb-3" style={{ color: '#4ade80', fontSize: '13px' }}>
            <CheckCircle size={15} /> Update applied successfully
          </div>
          {updateOutput && (
            <pre
              className="rounded p-3 mb-3"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {updateOutput}
            </pre>
          )}
          <p style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
            Restart the dev server to apply changes:
          </p>
          <pre
            className="rounded px-3 py-2 mt-1 inline-block"
            style={{ backgroundColor: 'var(--bg-elevated)', color: 'var(--text-accent)', fontSize: '12px' }}
          >
            npm run dev
          </pre>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-start gap-2 mt-4" style={{ color: '#f87171', fontSize: '13px' }}>
          <AlertCircle size={15} style={{ marginTop: 1, flexShrink: 0 }} />
          <span style={{ wordBreak: 'break-word' }}>{errorMsg}</span>
        </div>
      )}
    </div>
  );
}
