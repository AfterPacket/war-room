'use client';
import { useState, useEffect } from 'react';
import { Eye, EyeOff, Check, X, Loader2 } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/useSettingsStore';

interface ApiKeyFieldProps {
  service: string;
  label: string;
  description?: string;
  placeholder?: string;
  isConfigured: boolean;
  onSave: (service: string, key: string) => Promise<void>;
  onDelete: (service: string) => Promise<void>;
}

function ApiKeyField({ service, label, description, placeholder, isConfigured, onSave, onDelete }: ApiKeyFieldProps) {
  const [value, setValue] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    if (!value.trim()) return;
    setStatus('saving');
    try {
      await onSave(service, value.trim());
      setStatus('saved');
      setValue('');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('idle'), 3000);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`Remove ${label} API key?`)) return;
    setIsDeleting(true);
    try {
      await onDelete(service);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
      <div className="flex items-center justify-between mb-1">
        <label style={{ color: 'var(--text-primary)', fontSize: '13px' }}>{label}</label>
        {isConfigured && (
          <span
            className="flex items-center gap-1 font-data uppercase px-1.5 py-0.5"
            style={{ color: 'var(--severity-ok)', border: '1px solid var(--severity-ok)', fontSize: '9px' }}
          >
            <Check size={8} /> Configured
          </span>
        )}
      </div>
      {description && (
        <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginBottom: '8px' }}>{description}</p>
      )}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isConfigured ? '••••••••••••• (configured)' : placeholder || 'Enter API key...'}
            className="w-full px-3 py-2 font-data pr-10"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              outline: 'none',
            }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-tertiary)' }}
          >
            {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
        <button
          onClick={handleSave}
          disabled={!value.trim() || status === 'saving'}
          className="px-3 py-2 font-data uppercase transition-opacity disabled:opacity-40 flex items-center gap-1"
          style={{
            backgroundColor: status === 'saved' ? 'var(--severity-ok)' : status === 'error' ? 'var(--severity-critical)' : 'var(--bg-elevated)',
            border: '1px solid var(--border-active)',
            color: status === 'saved' || status === 'error' ? '#000' : 'var(--text-accent)',
            fontSize: '11px',
          }}
        >
          {status === 'saving' ? <Loader2 size={12} className="animate-spin" /> :
           status === 'saved' ? <><Check size={12} /> Saved</> :
           status === 'error' ? <><X size={12} /> Error</> : 'Save'}
        </button>
        {isConfigured && (
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="px-2 py-2 transition-opacity disabled:opacity-40"
            style={{
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--severity-critical)',
            }}
          >
            {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          </button>
        )}
      </div>
    </div>
  );
}

export function APIKeysTab() {
  const [configured, setConfigured] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { setConfiguredApis } = useSettingsStore();

  const fetchConfigured = async () => {
    try {
      const res = await fetch('/api/settings/keys');
      const data = await res.json();
      const services = data.services || [];
      setConfigured(services);
      // Also update the global store so NewsFeed / SituationBrief see the change immediately
      // without needing a page reload (Next.js router cache keeps page.tsx mounted).
      setConfiguredApis(services);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchConfigured(); }, []);

  const saveKey = async (service: string, key: string) => {
    const res = await fetch('/api/settings/keys', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service, key }),
    });
    if (!res.ok) throw new Error('Save failed');
    await fetchConfigured();
  };

  const deleteKey = async (service: string) => {
    const res = await fetch('/api/settings/keys', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ service }),
    });
    if (!res.ok) throw new Error('Delete failed');
    await fetchConfigured();
  };

  if (loading) {
    return <div className="p-4 acquiring font-data" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>Loading...</div>;
  }

  const API_GROUPS = [
    {
      title: 'AI Services',
      fields: [
        { service: 'claude', label: 'Anthropic (Claude) API Key', placeholder: 'sk-ant-...', description: 'Required for Claude AI briefings. Get at console.anthropic.com' },
        { service: 'openai', label: 'OpenAI (GPT) API Key', placeholder: 'sk-...', description: 'For GPT-4o briefings. Get at platform.openai.com' },
        { service: 'gemini', label: 'Google (Gemini) API Key', placeholder: 'AIza...', description: 'For Gemini briefings. Get at aistudio.google.com' },
      ],
    },
    {
      title: 'Map Services',
      fields: [
        { service: 'mapbox', label: 'Mapbox Access Token (optional)', placeholder: 'pk.eyJ1...', description: 'Map now uses free OpenStreetMap tiles — Mapbox key is no longer required' },
      ],
    },
    {
      title: 'News Services',
      fields: [
        { service: 'newsapi', label: 'NewsAPI.org Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Free tier at newsapi.org (100 req/day)' },
        { service: 'gnews', label: 'GNews.io Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Free tier at gnews.io' },
        { service: 'mediastack', label: 'MediaStack Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Alternative news source at mediastack.com' },
      ],
    },
    {
      title: 'Satellite / OSINT Services',
      fields: [
        { service: 'sentinel-client-id', label: 'Copernicus Sentinel Hub — Client ID', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', description: 'Free at dataspace.copernicus.eu — Create OAuth client credentials' },
        { service: 'sentinel-client-secret', label: 'Copernicus Sentinel Hub — Client Secret', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Same account as Client ID above' },
        { service: 'firms', label: 'NASA FIRMS MAP_KEY', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Free fire data API at firms.modaps.eosdis.nasa.gov/api' },
        { service: 'acled-email', label: 'ACLED Registered Email', placeholder: 'your@email.com', description: 'Email address registered at acleddata.com — Required alongside API key' },
        { service: 'acled', label: 'ACLED API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'API key from acleddata.com — Free for researchers. Requires email above.' },
        { service: 'opensky', label: 'OpenSky Network (Aircraft) — optional', placeholder: 'username:password', description: 'Free account at opensky-network.org — reduces aircraft refresh from 5 min to 2 min. Format: username:password' },
        { service: 'aishub', label: 'AISHub (Ships)', placeholder: 'AH_XXXXX', description: 'Free registration at aishub.net — provides live global AIS vessel data. Uses simulated data if not configured.' },
        { service: 'myshiptracking', label: 'MyShipTracking (Ships)', placeholder: 'your-api-key', description: 'API key from myshiptracking.com — tried first if configured, falls back to AISHub.' },
        { service: 'greynoise', label: 'GreyNoise API Key', placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', description: 'Free at greynoise.io — adds real-time internet scanner & exploit detection to the Cyber Threat Map.' },
      ],
    },
  ];

  return (
    <div className="max-w-2xl">
      {API_GROUPS.map((group) => (
        <div key={group.title} className="mb-8">
          <h3
            className="font-data uppercase mb-3 pb-2 border-b"
            style={{ color: 'var(--text-accent)', fontSize: '11px', letterSpacing: '0.1em', borderColor: 'var(--border-subtle)' }}
          >
            {group.title}
          </h3>
          {group.fields.map((field) => (
            <ApiKeyField
              key={field.service}
              {...field}
              isConfigured={configured.includes(field.service)}
              onSave={saveKey}
              onDelete={deleteKey}
            />
          ))}
        </div>
      ))}

      <div
        className="p-3 mt-4 font-data"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-tertiary)',
          fontSize: '11px',
        }}
      >
        🔒 All API keys are encrypted with AES-256-GCM and stored locally. They never leave your server.
      </div>
    </div>
  );
}
