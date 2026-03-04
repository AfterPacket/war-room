'use client';
import { useState } from 'react';
import { Panel } from '@/components/layout/Panel';
import { PanelEmptyState } from '@/components/layout/PanelEmptyState';
import { ChatInterface } from './ChatInterface';
import { SituationBrief } from './SituationBrief';
import { useSettingsStore } from '@/lib/store/useSettingsStore';
import { useNewsStore } from '@/lib/store/useNewsStore';

type Mode = 'brief' | 'chat';
const AI_PROVIDERS = ['claude', 'openai', 'gemini'] as const;

export function BriefingPanel() {
  const [mode, setMode] = useState<Mode>('brief');
  const { configuredApis, activeAiProvider, setActiveAiProvider } = useSettingsStore();
  const { items } = useNewsStore();

  const hasAi = configuredApis.some((s) => AI_PROVIDERS.includes(s as typeof AI_PROVIDERS[number]));

  // News context for chat
  const newsContext = items.length > 0
    ? `Current news (${items.length} items):\n` + items.slice(0, 10).map((i) => `- [${i.severity}] ${i.title} (${i.source})`).join('\n')
    : '';

  const controls = (
    <div className="flex items-center gap-2">
      {/* AI Provider selector */}
      <select
        value={activeAiProvider}
        onChange={(e) => setActiveAiProvider(e.target.value as typeof activeAiProvider)}
        className="font-data uppercase px-1.5 py-0.5"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--text-secondary)',
          fontSize: '10px',
          outline: 'none',
        }}
      >
        {AI_PROVIDERS.map((p) => (
          <option key={p} value={p} style={{ backgroundColor: 'var(--bg-elevated)' }}>
            {p === 'claude' ? 'CLAUDE' : p === 'openai' ? 'GPT-4' : 'GEMINI'}
            {configuredApis.includes(p) ? ' ●' : ' ○'}
          </option>
        ))}
      </select>

      {/* Mode tabs */}
      <div className="flex">
        {(['brief', 'chat'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="px-2 py-0.5 font-data uppercase"
            style={{
              fontSize: '10px',
              color: mode === m ? 'var(--text-accent)' : 'var(--text-tertiary)',
              borderBottom: mode === m ? '1px solid var(--text-accent)' : '1px solid transparent',
            }}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  );

  if (!hasAi) {
    return (
      <Panel title="AI Briefing" panelId="briefing" controls={controls}>
        <PanelEmptyState
          icon="🤖"
          message="Configure an AI API key (Claude, GPT, or Gemini) in Settings to enable AI briefings."
          action={{ label: 'Configure AI APIs', href: '/settings?tab=keys' }}
        />
      </Panel>
    );
  }

  return (
    <Panel title="AI Briefing" panelId="briefing" controls={controls} noPadding>
      {mode === 'brief' ? (
        <SituationBrief />
      ) : (
        <ChatInterface newsContext={newsContext} />
      )}
    </Panel>
  );
}
