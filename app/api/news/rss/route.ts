import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';
import { urlSchema, sanitizeHTML } from '@/lib/security/sanitize';
import { validateExternalUrl } from '@/lib/security/ssrf';
import { z } from 'zod';
import crypto from 'crypto';

const rssSchema = z.object({
  url: urlSchema,
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${ip}:news-rss`, 10, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = rssSchema.safeParse({ url: searchParams.get('url') });
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // SSRF protection
  const isValid = await validateExternalUrl(parsed.data.url);
  if (!isValid) {
    return NextResponse.json({ error: 'URL blocked for security reasons' }, { status: 403 });
  }

  try {
    const Parser = (await import('rss-parser')).default;
    const parser = new Parser({ timeout: 10000 });
    const feed = await parser.parseURL(parsed.data.url);

    const items = feed.items?.slice(0, 20).map((item) => ({
      id: crypto.createHash('md5').update(item.link || item.title || '').digest('hex'),
      title: sanitizeHTML(item.title || ''),
      description: sanitizeHTML(item.contentSnippet || item.content || ''),
      url: item.link || '',
      source: feed.title || 'RSS Feed',
      publishedAt: item.pubDate || new Date().toISOString(),
    })) || [];

    return NextResponse.json({ items, feedTitle: feed.title });
  } catch (error) {
    console.error('RSS parse error:', error);
    return NextResponse.json({ error: 'Failed to parse RSS feed' }, { status: 502 });
  }
}
