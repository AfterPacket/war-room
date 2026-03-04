'use client';
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useSettingsStore } from '@/lib/store/useSettingsStore';
import { useNewsStore } from '@/lib/store/useNewsStore';
import { format } from 'date-fns';

export function SituationBrief() {
  const [brief, setBrief] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const { activeAiProvider, configuredApis } = useSettingsStore();
  const { items } = useNewsStore();

  // Use the user's preferred provider; fall back to any configured AI
  const aiProviders = ['claude', 'openai', 'gemini'] as const;
  const provider = configuredApis.includes(activeAiProvider)
    ? activeAiProvider
    : aiProviders.find((p) => configuredApis.includes(p)) ?? null;
  const hasAi = !!provider;

  const generateBrief = async () => {
    if (isGenerating || !hasAi || items.length === 0) return;
    setIsGenerating(true);
    setBrief('');

    const topHeadlines = items
      .slice(0, 15)
      .map((i) => `[${i.severity.toUpperCase()}] ${i.title} (${i.source}, ${i.region})`)
      .join('\n');

    const prompt = `Generate a situation brief for the following ${items.length} news items. Format as:
BLUF: [1-2 sentence summary]

SITUATION:
[3-5 key developments]

ASSESSMENT:
[Analysis and patterns]

RECOMMENDATION:
[Watch items]

Headlines:
${topHeadlines}`;

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          provider,
        }),
      });

      if (!res.ok) {
        setBrief('Failed to generate brief. Check your API key in Settings.');
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;
      const dec = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value);
        const lines = chunk.split('\n').filter((l) => l.startsWith('data: '));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              fullText += data.text;
              setBrief(fullText);
            } else if (data.error) {
              setBrief(`Error: ${data.error}`);
            }
          } catch {}
        }
      }
      setGeneratedAt(new Date());
    } catch {
      setBrief('Error generating brief. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div>
          <span className="font-data uppercase" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
            Situation Brief
          </span>
          {generatedAt && (
            <div className="font-data" style={{ color: 'var(--text-tertiary)', fontSize: '10px' }}>
              Generated {format(generatedAt, 'dd MMM yyyy HHmm')}Z
            </div>
          )}
        </div>
        <button
          onClick={generateBrief}
          disabled={isGenerating || !hasAi || items.length === 0}
          className="flex items-center gap-1 px-2 py-1 font-data uppercase transition-opacity disabled:opacity-40"
          style={{
            backgroundColor: 'var(--bg-elevated)',
            border: '1px solid var(--border-active)',
            color: 'var(--text-accent)',
            fontSize: '10px',
          }}
        >
          <RefreshCw size={10} className={isGenerating ? 'animate-spin' : ''} />
          {isGenerating ? 'Generating...' : 'Generate Brief'}
        </button>
      </div>

      {/* Brief content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!hasAi && (
          <div className="text-center py-8" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
            Configure an AI API key in Settings to generate situation briefs.
          </div>
        )}
        {hasAi && !brief && !isGenerating && (
          <div className="text-center py-8" style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
            {items.length === 0
              ? 'No news data loaded yet. Configure a news source to get started.'
              : `${items.length} news items ready. Click "Generate Brief" to analyze.`}
          </div>
        )}
        {brief && (
          <pre
            className="whitespace-pre-wrap font-data leading-relaxed"
            style={{ color: 'var(--text-primary)', fontSize: '12px' }}
          >
            {brief}
            {isGenerating && <span className="acquiring">▌</span>}
          </pre>
        )}
      </div>
    </div>
  );
}
