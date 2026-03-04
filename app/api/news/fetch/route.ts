import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { sanitizeSearchQuery } from '@/lib/security/sanitize';
import { decryptApiKey } from '@/lib/security/encryption';
import { getApiKey } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';

const fetchSchema = z.object({
  query: z.string().max(200).optional(),
  category: z.string().max(50).optional(),
  region: z.string().max(50).optional(),
  pageSize: z.number().int().min(1).max(50).optional().default(20),
});

// Free RSS feeds — no API key required, always available as fallback
const FREE_RSS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml',  source: 'BBC News' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml',    source: 'Al Jazeera' },
  { url: 'https://www.theguardian.com/world/rss',        source: 'The Guardian' },
  { url: 'https://feeds.npr.org/1004/rss.xml',           source: 'NPR World' },
];

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:news-fetch`, 10, 5 * 60 * 1000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const parsed = fetchSchema.safeParse({
      query: searchParams.get('query') || undefined,
      category: searchParams.get('category') || undefined,
      region: searchParams.get('region') || undefined,
      pageSize: searchParams.get('pageSize') ? parseInt(searchParams.get('pageSize')!) : undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
    }

    const { pageSize } = parsed.data;
    const query = parsed.data.query ? sanitizeSearchQuery(parsed.data.query) : 'world news';

    const allItems: NewsItemRaw[] = [];
    const errors: string[] = [];

    // Try NewsAPI
    const newsApiKey = getApiKey('newsapi');
    if (newsApiKey) {
      try {
        const key = decryptApiKey(newsApiKey);
        const items = await fetchNewsAPI(key, query, pageSize);
        allItems.push(...items);
      } catch (e) {
        errors.push(`newsapi: ${e instanceof Error ? e.message : 'fetch failed'}`);
      }
    }

    // Try GNews
    const gnewsKey = getApiKey('gnews');
    if (gnewsKey && allItems.length < pageSize) {
      try {
        const key = decryptApiKey(gnewsKey);
        const items = await fetchGNews(key, query, pageSize);
        allItems.push(...items);
      } catch (e) {
        errors.push(`gnews: ${e instanceof Error ? e.message : 'fetch failed'}`);
      }
    }

    // Free RSS feeds — run in parallel, always supplement/replace failed API sources
    if (allItems.length < pageSize) {
      const rssItems = await fetchFreeRSS();
      allItems.push(...rssItems);
    }

    // Deduplicate by title similarity, then sort newest-first
    const unique = deduplicateNews(allItems).sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    );

    return NextResponse.json({
      items: unique.slice(0, pageSize * 2),
      count: unique.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('News fetch error:', error);
    return NextResponse.json({ error: 'Failed to fetch news' }, { status: 500 });
  }
}

interface NewsItemRaw {
  id: string;
  title: string;
  description: string;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
}

async function fetchNewsAPI(key: string, query: string, pageSize: number): Promise<NewsItemRaw[]> {
  const from = new Date(Date.now() - 6 * 3600000).toISOString();
  const q = encodeURIComponent(query || 'world OR politics OR conflict OR economy OR military');
  const url = `https://newsapi.org/v2/everything?language=en&sortBy=publishedAt&pageSize=${pageSize}&from=${from}&q=${q}&apiKey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    // Fallback to top-headlines if everything fails (e.g. plan restriction)
    const fallback = await fetch(
      `https://newsapi.org/v2/top-headlines?language=en&pageSize=${pageSize}&apiKey=${key}`,
      { cache: 'no-store' }
    );
    if (!fallback.ok) throw new Error(`HTTP ${fallback.status}`);
    const fb = await fallback.json();
    if (fb.status === 'error') throw new Error(`${fb.code || fb.status}: ${fb.message || ''}`);
    return mapNewsAPIArticles(fb.articles || []);
  }
  const data = await res.json();
  if (data.status === 'error') throw new Error(`${data.code || data.status}: ${data.message || ''}`);
  return mapNewsAPIArticles(data.articles || []);
}

function mapNewsAPIArticles(articles: { title: string; description: string; url: string; source: { name: string }; publishedAt: string; urlToImage: string }[]): NewsItemRaw[] {
  return articles.map((a) => ({
    id: crypto.createHash('md5').update(a.url).digest('hex'),
    title: a.title || '',
    description: a.description || '',
    url: a.url,
    source: a.source?.name || 'NewsAPI',
    publishedAt: a.publishedAt,
    imageUrl: a.urlToImage,
  }));
}

async function fetchGNews(key: string, query: string, pageSize: number): Promise<NewsItemRaw[]> {
  const url = `https://gnews.io/api/v4/top-headlines?lang=en&max=${pageSize}&sortby=publishedAt&apikey=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (data.errors) throw new Error(Array.isArray(data.errors) ? data.errors.join(', ') : String(data.errors));
  return (data.articles || []).map((a: { title: string; description: string; url: string; source: { name: string }; publishedAt: string; image: string }) => ({
    id: crypto.createHash('md5').update(a.url).digest('hex'),
    title: a.title || '',
    description: a.description || '',
    url: a.url,
    source: a.source?.name || 'GNews',
    publishedAt: a.publishedAt,
    imageUrl: a.image,
  }));
}

async function fetchFreeRSS(): Promise<NewsItemRaw[]> {
  const Parser = (await import('rss-parser')).default;
  const parser = new Parser({ timeout: 8000 });
  const results: NewsItemRaw[] = [];

  await Promise.allSettled(
    FREE_RSS_FEEDS.map(async ({ url, source }) => {
      try {
        const feed = await parser.parseURL(url);
        const items = (feed.items || []).slice(0, 12).map((item) => ({
          id: crypto.createHash('md5').update(item.link || item.title || '').digest('hex'),
          title: item.title || '',
          description: item.contentSnippet || '',
          url: item.link || '',
          source,
          publishedAt: item.pubDate || new Date().toISOString(),
        }));
        results.push(...items);
      } catch {
        // Individual feed failure is non-fatal
      }
    })
  );

  return results;
}

function deduplicateNews(items: NewsItemRaw[]): NewsItemRaw[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
