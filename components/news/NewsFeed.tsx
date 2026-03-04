'use client';
import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Panel } from '@/components/layout/Panel';
import { PanelEmptyState } from '@/components/layout/PanelEmptyState';
import { NewsItemCard } from './NewsItem';
import { NewsFilters } from './NewsFilters';
import { useNewsStore, type NewsItem } from '@/lib/store/useNewsStore';
import { useSettingsStore } from '@/lib/store/useSettingsStore';

export function NewsFeed() {
  const { items, isLoading, lastFetched, filter, setItems, addItems, setLoading, setLastFetched } = useNewsStore();
  const { configuredApis, activeAiProvider } = useSettingsStore();

  const hasNewsApi = configuredApis.some((s) => ['newsapi', 'gnews', 'mediastack'].includes(s));
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchNewsRef = useRef<() => void>(() => {});

  const fetchNews = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/news/fetch?pageSize=30');
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (data.errors?.length) setFetchError(data.errors.join(' · '));
      if (data.items && data.items.length > 0) {
        // Show immediately with keyword categorization — don't block on AI
        const keywordCategorized: NewsItem[] = data.items.map((item: NewsItem) => ({
          ...item,
          category: item.category || guessCategory(item.title),
          severity: item.severity || guessSeverity(item.title),
          region: item.region || 'global',
        }));

        // First load: replace everything. Subsequent refreshes: prepend new items only.
        // Read store directly to avoid stale closure from setInterval.
        if (useNewsStore.getState().items.length === 0) {
          setItems(keywordCategorized);
        } else {
          addItems(keywordCategorized);
        }
        setLastFetched(Date.now());
        setLoading(false);

        // Background AI categorization — use preferred provider, fall back to any available
        const aiProviders = ['claude', 'openai', 'gemini'] as const;
        const aiProvider = configuredApis.includes(activeAiProvider)
          ? activeAiProvider
          : aiProviders.find((p) => configuredApis.includes(p)) ?? null;
        if (aiProvider) {
          fetch('/api/ai/categorize', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              headlines: data.items.slice(0, 20).map((i: NewsItem) => ({ id: i.id, title: i.title })),
              provider: aiProvider,
            }),
          })
            .then((r) => r.json())
            .then((catData) => {
              if (catData.categories) {
                const catMap = new Map(
                  catData.categories.map((c: { id: string; category: string; severity: string; region: string }) => [c.id, c])
                );
                // Update only the newly fetched items with AI categories
                const updatedCategorized = keywordCategorized.map((item) => {
                  const cat = catMap.get(item.id) as { id: string; category: string; severity: string; region: string } | undefined;
                  return cat ? { ...item, category: cat.category as NewsItem['category'], severity: cat.severity as NewsItem['severity'], region: cat.region } : item;
                });
                addItems(updatedCategorized); // addItems deduplicates — replaces none, updates nothing (store doesn't merge)
                setItems(
                  useNewsStore.getState().items.map((existing) => {
                    const updated = updatedCategorized.find((u) => u.id === existing.id);
                    return updated || existing;
                  })
                );
              }
            })
            .catch(() => {});
        }
        return; // already called setLoading(false) above
      }
    } catch (error) {
      console.error('News fetch error:', error);
      setFetchError(error instanceof Error ? error.message : 'Fetch failed');
    } finally {
      setLoading(false);
    }
  };

  // Keep ref pointing at latest fetchNews so the interval never has a stale closure
  useEffect(() => { fetchNewsRef.current = fetchNews; });

  // Initial fetch on mount / when configured APIs change
  useEffect(() => {
    if (!hasNewsApi) return;
    fetchNewsRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasNewsApi, configuredApis.join(',')]);

  // 5-minute auto-refresh
  useEffect(() => {
    if (!hasNewsApi) return;
    const interval = setInterval(() => fetchNewsRef.current(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [hasNewsApi]);

  // Filter items
  const filtered = items.filter((item) => {
    if (filter.severity !== 'all' && item.severity !== filter.severity) return false;
    if (filter.category !== 'all' && item.category !== filter.category) return false;
    if (filter.region !== 'all' && item.region !== filter.region) return false;
    if (filter.search) {
      const q = filter.search.toLowerCase();
      return item.title.toLowerCase().includes(q) || item.description?.toLowerCase().includes(q);
    }
    return true;
  });

  const controls = (
    <button
      onClick={fetchNews}
      disabled={isLoading}
      className="p-0.5 rounded transition-opacity hover:opacity-70 disabled:opacity-30"
      style={{ color: 'var(--text-tertiary)' }}
      title="Refresh news"
    >
      <RefreshCw size={11} className={isLoading ? 'animate-spin' : ''} />
    </button>
  );

  if (!hasNewsApi) {
    return (
      <Panel title="News Feed" panelId="news" controls={controls}>
        <PanelEmptyState
          icon="📡"
          message="No news sources configured. Add a NewsAPI or GNews key in Settings to start."
          action={{ label: 'Configure News APIs', href: '/settings?tab=keys' }}
        />
      </Panel>
    );
  }

  return (
    <Panel title="News Feed" panelId="news" controls={controls} noPadding>
      <div className="flex flex-col h-full">
        <NewsFilters />
        <div className="flex-1 overflow-y-auto">
          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <span className="acquiring font-data uppercase" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}>
                ACQUIRING DATA...
              </span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-32">
              <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>No items match filters</span>
            </div>
          ) : (
            filtered.map((item) => <NewsItemCard key={item.id} item={item} />)
          )}
        </div>
        {fetchError && (
          <div
            className="flex-shrink-0 px-3 py-1.5 font-data"
            style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--severity-critical)', fontSize: '10px' }}
          >
            ⚠ {fetchError}
          </div>
        )}
        {lastFetched && (
          <div
            className="flex-shrink-0 px-3 py-1.5 font-data"
            style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-tertiary)', fontSize: '10px' }}
          >
            {filtered.length} items · Updated {new Date(lastFetched).toLocaleTimeString()}
          </div>
        )}
      </div>
    </Panel>
  );
}

function guessCategory(title: string): NewsItem['category'] {
  const t = title.toLowerCase();
  if (/war|attack|missile|bomb|conflict|troops|military|killed|explosion|airstrike|drone|strike|coup|insurgent|terror|combat|weapon|navy|army|air force|nuclear|nato|ceasefire|casualties|frontline|offensive|invasion|siege|hostage|armed|warfare|battle|soldier|prisoner/.test(t)) return 'conflict';
  if (/election|president|congress|government|vote|policy|senate|parliament|minister|diplomat|diplomacy|treaty|summit|nato|un |united nations|white house|kremlin|sanctions|foreign|bilateral|coalition|legislation|bill|law|court|supreme|administration|governor|chancellor|prime minister|referendum|ballot|party|democrat|republican/.test(t)) return 'politics';
  if (/market|stock|economy|trade|gdp|inflation|rate|dollar|oil|bank|fed|reserve|recession|invest|fund|tariff|export|import|finance|budget|deficit|debt|commodity|energy|price|revenue|profit|loss|earnings|sector|industry|employment|jobs|unemployment|wage|gas|barrel/.test(t)) return 'economy';
  if (/tech|ai |artificial intelligence|software|apple|google|microsoft|chip|data|cyber|hack|breach|robot|space|nasa|satellite|launch|algorithm|platform|social media|twitter|facebook|meta|amazon|tesla|crypto|bitcoin|blockchain|quantum|5g|internet/.test(t)) return 'technology';
  if (/covid|health|disease|hospital|vaccine|virus|cancer|doctor|medicine|drug|fda|who |outbreak|epidemic|pandemic|surgery|clinical|patient|treatment|mental health|infection|death toll|mortality/.test(t)) return 'health';
  if (/climate|wildfire|fire|flood|earthquake|storm|hurricane|tornado|tsunami|environment|emissions|carbon|pollution|drought|glacier|ocean|temperature|extreme weather|natural disaster|deforestation|biodiversity/.test(t)) return 'environment';
  return 'general';
}

function guessSeverity(title: string): NewsItem['severity'] {
  const t = title.toLowerCase();
  if (/breaking|urgent|attack|killed|explosion|emergency|crisis|dead|deaths|casualties|massacre|assassination|nuclear|catastrophe|collapse/.test(t)) return 'critical';
  if (/war|conflict|missile|troops|threat|sanctions|strike|offensive|invasion|escalation|confrontation|warning|alert|tensions/.test(t)) return 'high';
  if (/election|protest|deal|agreement|talks|negotiations|meeting|summit|statement|report|probe|investigation/.test(t)) return 'medium';
  return 'low';
}
