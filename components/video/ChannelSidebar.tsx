'use client';
import { useState, useEffect } from 'react';
import { X, Plus, Lock, Trash2, Edit3, ToggleLeft, ToggleRight, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { useStreamStore, type StreamChannel } from '@/lib/store/useStreamStore';
import { resolveStreamUrl } from '@/lib/utils/streamResolver';

interface ChannelSidebarProps {
  onSelect: (channel: StreamChannel) => void;
  onClose: () => void;
}

interface ProxyStreamRow {
  id: string;
  name: string;
  url: string;
  category: string;
  enabled: boolean;
  user_agent?: string;
  referer?: string;
  origin_header?: string;
  cookies?: string;
  notes?: string;
}

// ─── Header form state ────────────────────────────────────────────────────────
interface HeaderFields {
  user_agent: string;
  referer: string;
  origin_header: string;
  cookies: string;
  notes: string;
}

const EMPTY_HEADERS: HeaderFields = { user_agent: '', referer: '', origin_header: '', cookies: '', notes: '' };

// ─── Main component ───────────────────────────────────────────────────────────
export function ChannelSidebar({ onSelect, onClose }: ChannelSidebarProps) {
  const { channels, addChannel, removeChannel, updateChannel, savedCategories, tiles, setTileChannel } = useStreamStore();

  // Tab: 'channels' | 'add' | 'managed'
  const [tab, setTab] = useState<'channels' | 'add' | 'managed'>('channels');
  const [activeCategory, setActiveCategory] = useState('All');

  // Add-stream form
  const [customName, setCustomName] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customCategory, setCustomCategory] = useState('Custom');
  const [showHeaders, setShowHeaders] = useState(false);
  const [headers, setHeaders] = useState<HeaderFields>(EMPTY_HEADERS);
  const [formError, setFormError] = useState('');
  const [formStatus, setFormStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Managed (proxy) streams from DB
  const [proxyStreams, setProxyStreams] = useState<ProxyStreamRow[]>([]);
  const [loadingProxy, setLoadingProxy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<ProxyStreamRow & HeaderFields>>({});

  // Library inline edit state
  const [editingLibId, setEditingLibId] = useState<string | null>(null);
  const [editLibFields, setEditLibFields] = useState<{ name: string; url: string; category: string }>({ name: '', url: '', category: '' });

  const startLibEdit = (ch: StreamChannel) => {
    setEditingLibId(ch.id);
    setEditLibFields({ name: ch.name, url: ch.url, category: ch.category });
  };
  const saveLibEdit = () => {
    if (!editingLibId || !editLibFields.url.trim()) return;
    const resolved = resolveStreamUrl(editLibFields.url.trim());
    updateChannel(editingLibId, {
      name: editLibFields.name.trim() || editLibFields.url.trim(),
      url: editLibFields.url.trim(),
      category: editLibFields.category.trim() || 'Custom',
      type: resolved.type,
    });
    setEditingLibId(null);
  };

  const categories = ['All', ...savedCategories];
  const filtered = activeCategory === 'All' ? channels : channels.filter((c) => c.category === activeCategory);

  // ── Load proxy streams from DB ────────────────────────────────────────────
  const loadProxyStreams = async () => {
    setLoadingProxy(true);
    try {
      const res = await fetch('/api/streams');
      const data = await res.json();
      setProxyStreams(data.streams || []);
    } catch { /* ignore */ } finally {
      setLoadingProxy(false);
    }
  };

  useEffect(() => { if (tab === 'managed') loadProxyStreams(); }, [tab]);

  // ── Add regular stream (no headers) ──────────────────────────────────────
  const handleAddRegular = () => {
    if (!customUrl.trim()) { setFormError('Enter a URL'); return; }
    try { new URL(customUrl); } catch { setFormError('Invalid URL'); return; }

    const resolved = resolveStreamUrl(customUrl);
    const channel: StreamChannel = {
      id: `custom-${Date.now()}`,
      name: customName.trim() || resolved.channelName || 'Custom Stream',
      url: customUrl.trim(),
      type: resolved.type,
      category: customCategory,
    };
    addChannel(channel);
    onSelect(channel);
    resetForm();
  };

  // ── Add protected proxy stream (has headers → goes to DB + proxy) ─────────
  const handleAddProxy = async () => {
    if (!customUrl.trim()) { setFormError('Enter a stream URL'); return; }
    try { new URL(customUrl); } catch { setFormError('Invalid URL'); return; }
    if (!customName.trim()) { setFormError('Enter a stream name'); return; }

    setFormStatus('saving');
    setFormError('');

    try {
      const res = await fetch('/api/streams', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: customName.trim(),
          url: customUrl.trim(),
          category: customCategory,
          enabled: true,
          user_agent: headers.user_agent || undefined,
          referer: headers.referer || undefined,
          origin_header: headers.origin_header || undefined,
          cookies: headers.cookies || undefined,
          notes: headers.notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setFormError(data.error || 'Save failed'); setFormStatus('error'); return; }

      // Create channel pointing at our HLS proxy
      const channel: StreamChannel = {
        id: data.id,
        name: customName.trim(),
        url: `/api/proxy/hls?id=${data.id}`,
        type: 'hls',
        category: customCategory,
        isProxy: true,
      };
      addChannel(channel);
      setFormStatus('saved');
      setTimeout(() => { onSelect(channel); resetForm(); }, 800);
    } catch {
      setFormError('Network error — please try again');
      setFormStatus('error');
    }
  };

  const resetForm = () => {
    setCustomName(''); setCustomUrl(''); setCustomCategory('Custom');
    setShowHeaders(false); setHeaders(EMPTY_HEADERS);
    setFormError(''); setFormStatus('idle');
  };

  const hasHeaders = Object.values(headers).some((v) => v.trim());

  // ── Managed stream actions ────────────────────────────────────────────────
  const toggleEnabled = async (id: string, current: boolean) => {
    await fetch('/api/streams', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, enabled: !current }),
    });
    setProxyStreams((prev) => prev.map((s) => s.id === id ? { ...s, enabled: !current } : s));
  };

  const deleteProxy = async (id: string) => {
    if (!confirm('Remove this protected stream and delete its configuration?')) return;
    await fetch(`/api/streams?id=${id}`, { method: 'DELETE' });
    removeChannel(id);
    setProxyStreams((prev) => prev.filter((s) => s.id !== id));
  };

  const startEdit = (s: ProxyStreamRow) => {
    setEditingId(s.id);
    setEditFields({ name: s.name, url: s.url, user_agent: s.user_agent, referer: s.referer, origin_header: s.origin_header, cookies: s.cookies, notes: s.notes });
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await fetch('/api/streams', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: editingId, ...editFields }),
    });
    setProxyStreams((prev) => prev.map((s) => s.id === editingId ? { ...s, ...editFields } : s));
    setEditingId(null);
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{ backgroundColor: 'var(--bg-overlay)', border: '1px solid var(--border-active)' }}
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-2 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex gap-0">
          {(['channels', 'add', 'managed'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1 font-data uppercase"
              style={{
                fontSize: '10px',
                color: tab === t ? 'var(--text-accent)' : 'var(--text-tertiary)',
                borderBottom: tab === t ? '2px solid var(--text-accent)' : '2px solid transparent',
              }}
            >
              {t === 'channels' ? 'Library' : t === 'add' ? '+ Add Stream' : '🔒 Protected'}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ color: 'var(--text-tertiary)' }}><X size={14} /></button>
      </div>

      {/* ══ TAB: CHANNEL LIBRARY ══════════════════════════════════════════════ */}
      {tab === 'channels' && (
        <>
          {/* Category tabs */}
          <div className="flex gap-0 overflow-x-auto flex-shrink-0" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className="px-3 py-1.5 font-data uppercase flex-shrink-0"
                style={{
                  fontSize: '10px',
                  color: activeCategory === cat ? 'var(--text-accent)' : 'var(--text-tertiary)',
                  borderBottom: activeCategory === cat ? '2px solid var(--text-accent)' : '2px solid transparent',
                }}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Channel list */}
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.map((ch) => (
              <div key={ch.id} className="border-b" style={{ borderColor: 'var(--border-subtle)' }}>
                {editingLibId === ch.id ? (
                  // ── Inline edit mode ──
                  <div className="flex flex-col gap-1.5 px-3 py-2">
                    <InputField label="Name" value={editLibFields.name} onChange={(v) => setEditLibFields((f) => ({ ...f, name: v }))} placeholder="Channel name" />
                    <InputField label="URL (.m3u8 / YouTube / Twitch)" value={editLibFields.url} onChange={(v) => setEditLibFields((f) => ({ ...f, url: v }))} placeholder="https://..." />
                    <InputField label="Category" value={editLibFields.category} onChange={(v) => setEditLibFields((f) => ({ ...f, category: v }))} placeholder="Custom" />
                    <div className="flex gap-2 mt-0.5">
                      <button onClick={saveLibEdit} className="flex-1 py-1 font-data uppercase" style={{ backgroundColor: 'var(--text-accent)', color: 'var(--bg-base)', fontSize: '10px' }}>
                        Save
                      </button>
                      <button onClick={() => setEditingLibId(null)} className="flex-1 py-1 font-data uppercase" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', fontSize: '10px' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── Display mode ──
                  <div className="flex items-center gap-1 pr-1 hover:bg-elevated group">
                    <button
                      onClick={() => onSelect(ch)}
                      className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-w-0"
                    >
                      <span
                        className="font-data uppercase px-1 py-0.5 flex-shrink-0"
                        style={{
                          fontSize: '9px',
                          backgroundColor: 'var(--bg-base)',
                          color: ch.type === 'youtube' ? '#ef4444'
                            : ch.type === 'twitch' ? '#9146ff'
                            : ch.isProxy ? 'var(--severity-high)'
                            : 'var(--text-tertiary)',
                        }}
                      >
                        {ch.type === 'youtube' ? 'YT' : ch.type === 'twitch' ? 'TW' : ch.isProxy ? '🔒' : 'HLS'}
                      </span>
                      <span className="truncate" style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>{ch.name}</span>
                    </button>
                    <button
                      onClick={() => startLibEdit(ch)}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Edit channel"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <Edit3 size={11} />
                    </button>
                    <button
                      onClick={() => {
                        if (!confirm(`Remove "${ch.name}" from the library?`)) return;
                        tiles.forEach((t) => { if (t.channel?.id === ch.id) setTileChannel(t.id, null); });
                        removeChannel(ch.id);
                      }}
                      className="p-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                      title="Remove channel"
                      style={{ color: 'var(--severity-critical)' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ══ TAB: ADD STREAM ══════════════════════════════════════════════════ */}
      {tab === 'add' && (
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
          <InputField label="Stream Name" value={customName} onChange={setCustomName} placeholder="My Stream" />
          <InputField label="URL (.m3u8 / YouTube / Twitch)" value={customUrl} onChange={(v) => { setCustomUrl(v); setFormError(''); }} placeholder="https://..." />

          <div className="flex gap-2">
            <div className="flex-1">
              <label className="font-data uppercase block mb-1" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>Category</label>
              <input
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                className="w-full px-2 py-1.5 font-data"
                style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '11px', outline: 'none' }}
                placeholder="Custom"
              />
            </div>
          </div>

          {/* Custom headers toggle */}
          <button
            onClick={() => setShowHeaders((v) => !v)}
            className="flex items-center gap-2 py-1.5 px-2 font-data uppercase transition-colors"
            style={{
              border: `1px solid ${showHeaders ? 'var(--severity-high)' : 'var(--border-subtle)'}`,
              color: showHeaders ? 'var(--severity-high)' : 'var(--text-tertiary)',
              backgroundColor: showHeaders ? 'rgba(251,146,60,0.07)' : 'transparent',
              fontSize: '10px',
            }}
          >
            <Lock size={10} />
            Protected stream (Nimble / referrer-locked)
            {showHeaders ? <ChevronUp size={10} className="ml-auto" /> : <ChevronDown size={10} className="ml-auto" />}
          </button>

          {showHeaders && (
            <div className="flex flex-col gap-2 pl-2" style={{ borderLeft: '2px solid var(--severity-high)' }}>
              <p className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                Headers are stored server-side and injected by the backend proxy. The browser never sends them directly.
              </p>
              <InputField label="User-Agent" value={headers.user_agent} onChange={(v) => setHeaders((h) => ({ ...h, user_agent: v }))} placeholder="Mozilla/5.0 or ffplay/..." />
              <InputField label="Referer" value={headers.referer} onChange={(v) => setHeaders((h) => ({ ...h, referer: v }))} placeholder="https://broadcaster-site.com/" />
              <InputField label="Origin" value={headers.origin_header} onChange={(v) => setHeaders((h) => ({ ...h, origin_header: v }))} placeholder="https://broadcaster-site.com" />
              <InputField label="Cookies" value={headers.cookies} onChange={(v) => setHeaders((h) => ({ ...h, cookies: v }))} placeholder="session=abc; token=xyz" />
              <InputField label="Notes" value={headers.notes} onChange={(v) => setHeaders((h) => ({ ...h, notes: v }))} placeholder="e.g. nimblesessionid expires in ~4h" />
            </div>
          )}

          {formError && (
            <div className="flex items-center gap-1" style={{ color: 'var(--severity-critical)', fontSize: '11px' }}>
              <AlertCircle size={11} />{formError}
            </div>
          )}

          <button
            onClick={hasHeaders || showHeaders ? handleAddProxy : handleAddRegular}
            disabled={formStatus === 'saving'}
            className="flex items-center justify-center gap-1.5 py-2 font-data uppercase transition-opacity disabled:opacity-50"
            style={{
              backgroundColor: formStatus === 'saved' ? 'var(--severity-ok)'
                : formStatus === 'error' ? 'var(--severity-critical)'
                : 'var(--text-accent)',
              color: 'var(--bg-base)',
              fontSize: '11px',
            }}
          >
            {formStatus === 'saving' ? '...' : formStatus === 'saved' ? '✓ Added' : formStatus === 'error' ? '✗ Failed' : (
              <><Plus size={12} /> {hasHeaders || showHeaders ? 'Add Protected Stream (Proxied)' : 'Add Stream'}</>
            )}
          </button>

          {(hasHeaders || showHeaders) && formStatus === 'idle' && (
            <p className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
              Stream will be proxied through the server. Headers are stored encrypted and never exposed to the browser.
            </p>
          )}
        </div>
      )}

      {/* ══ TAB: MANAGED PROTECTED STREAMS ═══════════════════════════════════ */}
      {tab === 'managed' && (
        <div className="flex-1 overflow-y-auto">
          {loadingProxy ? (
            <div className="flex items-center justify-center h-20 font-data acquiring" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
              LOADING...
            </div>
          ) : proxyStreams.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-24 gap-2 px-4 text-center">
              <Lock size={16} style={{ color: 'var(--text-tertiary)' }} />
              <span className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                No protected streams yet. Add a stream with custom headers in the + Add Stream tab.
              </span>
            </div>
          ) : (
            proxyStreams.map((s) => (
              <div key={s.id} className="border-b px-3 py-2.5" style={{ borderColor: 'var(--border-subtle)' }}>
                {editingId === s.id ? (
                  // ── Edit mode ──
                  <div className="flex flex-col gap-1.5">
                    <InputField label="Name" value={editFields.name || ''} onChange={(v) => setEditFields((f) => ({ ...f, name: v }))} placeholder="Stream name" />
                    <InputField label="URL" value={editFields.url || ''} onChange={(v) => setEditFields((f) => ({ ...f, url: v }))} placeholder="https://..." />
                    <InputField label="User-Agent" value={editFields.user_agent || ''} onChange={(v) => setEditFields((f) => ({ ...f, user_agent: v }))} placeholder="" />
                    <InputField label="Referer" value={editFields.referer || ''} onChange={(v) => setEditFields((f) => ({ ...f, referer: v }))} placeholder="" />
                    <InputField label="Origin" value={editFields.origin_header || ''} onChange={(v) => setEditFields((f) => ({ ...f, origin_header: v }))} placeholder="" />
                    <InputField label="Cookies" value={editFields.cookies || ''} onChange={(v) => setEditFields((f) => ({ ...f, cookies: v }))} placeholder="" />
                    <div className="flex gap-2 mt-1">
                      <button onClick={saveEdit} className="flex-1 py-1 font-data uppercase" style={{ backgroundColor: 'var(--text-accent)', color: 'var(--bg-base)', fontSize: '10px' }}>
                        Save
                      </button>
                      <button onClick={() => setEditingId(null)} className="flex-1 py-1 font-data uppercase" style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', fontSize: '10px' }}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  // ── Display mode ──
                  <>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <Lock size={10} style={{ color: s.enabled ? 'var(--severity-high)' : 'var(--text-tertiary)', flexShrink: 0 }} />
                          <span
                            className="font-data"
                            style={{ color: s.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)', fontSize: '12px', textDecoration: s.enabled ? 'none' : 'line-through' }}
                          >
                            {s.name}
                          </span>
                        </div>
                        <div className="font-data truncate mt-0.5" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
                          {s.url.length > 50 ? s.url.slice(0, 50) + '…' : s.url}
                        </div>
                        {s.notes && (
                          <div className="font-data mt-0.5" style={{ color: 'var(--text-tertiary)', fontSize: '9px' }}>
                            ℹ {s.notes}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => toggleEnabled(s.id, s.enabled)} title={s.enabled ? 'Disable' : 'Enable'} style={{ color: s.enabled ? 'var(--text-accent)' : 'var(--text-tertiary)' }}>
                          {s.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>
                        <button onClick={() => startEdit(s)} style={{ color: 'var(--text-tertiary)' }}><Edit3 size={13} /></button>
                        <button onClick={() => deleteProxy(s.id)} style={{ color: 'var(--severity-critical)' }}><Trash2 size={13} /></button>
                      </div>
                    </div>
                    {/* Select button */}
                    {s.enabled && (
                      <button
                        onClick={() => {
                          const channel: StreamChannel = {
                            id: s.id, name: s.name,
                            url: `/api/proxy/hls?id=${s.id}`,
                            type: 'hls', category: s.category, isProxy: true,
                          };
                          onSelect(channel);
                        }}
                        className="w-full mt-2 py-1 font-data uppercase"
                        style={{ border: '1px solid var(--border-active)', color: 'var(--text-accent)', fontSize: '10px' }}
                      >
                        Load Stream
                      </button>
                    )}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Small shared input component ─────────────────────────────────────────────
function InputField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div>
      <label className="font-data uppercase block mb-0.5" style={{ color: 'var(--text-tertiary)', fontSize: '9px' }}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1.5 font-data"
        style={{ backgroundColor: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontSize: '11px', outline: 'none' }}
      />
    </div>
  );
}
