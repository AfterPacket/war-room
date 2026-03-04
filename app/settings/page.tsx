'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { APIKeysTab } from '@/components/settings/APIKeysTab';
import { DisplayTab } from '@/components/settings/DisplayTab';
import { WorldClocksTab } from '@/components/settings/WorldClocksTab';
import { UpdatesTab } from '@/components/settings/UpdatesTab';

type Tab = 'keys' | 'display' | 'clocks' | 'updates';

const TABS: { id: Tab; label: string }[] = [
  { id: 'keys', label: 'API Keys' },
  { id: 'display', label: 'Display' },
  { id: 'clocks', label: 'World Clocks' },
  { id: 'updates', label: 'Updates' },
];

export default function SettingsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('keys');

  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-4 px-6 py-3 border-b"
        style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
      >
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 transition-colors hover:text-primary"
          style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}
        >
          <ArrowLeft size={14} /> Back to War Room
        </button>
        <h1
          className="font-data uppercase tracking-widest"
          style={{ color: 'var(--text-accent)', fontSize: 'var(--text-lg)' }}
        >
          ⚙ Settings
        </h1>
      </div>

      <div className="flex h-[calc(100vh-52px)]">
        {/* Sidebar */}
        <nav
          className="w-48 flex-shrink-0 border-r py-4"
          style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-subtle)' }}
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="w-full text-left px-4 py-2.5 font-data uppercase transition-colors"
              style={{
                fontSize: '11px',
                color: activeTab === tab.id ? 'var(--text-accent)' : 'var(--text-secondary)',
                backgroundColor: activeTab === tab.id ? 'var(--bg-elevated)' : 'transparent',
                borderLeft: activeTab === tab.id ? '2px solid var(--text-accent)' : '2px solid transparent',
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          {activeTab === 'keys' && <APIKeysTab />}
          {activeTab === 'display' && <DisplayTab />}
          {activeTab === 'clocks' && <WorldClocksTab />}
          {activeTab === 'updates' && <UpdatesTab />}
        </main>
      </div>
    </div>
  );
}
