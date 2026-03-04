import { NextRequest, NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';

// ── Market definitions ──────────────────────────────────────────────────────

interface MarketDef {
  symbol: string;
  name: string;
  flag: string;
}

const MARKETS: MarketDef[] = [
  // USA
  { symbol: '^GSPC',     name: 'S&P 500',    flag: 'US' },
  { symbol: '^DJI',      name: 'DOW',        flag: 'US' },
  { symbol: '^IXIC',     name: 'NASDAQ',     flag: 'US' },
  { symbol: '^RUT',      name: 'RUSSELL',    flag: 'US' },
  // Europe
  { symbol: '^FTSE',     name: 'FTSE 100',   flag: 'GB' },
  { symbol: '^GDAXI',    name: 'DAX',        flag: 'DE' },
  { symbol: '^FCHI',     name: 'CAC 40',     flag: 'FR' },
  { symbol: '^STOXX50E', name: 'STOXX 50',   flag: 'EU' },
  // Asia
  { symbol: '^N225',     name: 'NIKKEI',     flag: 'JP' },
  { symbol: '^HSI',      name: 'HANG SENG',  flag: 'HK' },
  { symbol: '000001.SS', name: 'SHANGHAI',   flag: 'CN' },
  { symbol: '399001.SZ', name: 'SHENZHEN',   flag: 'CN' },
  { symbol: '^KS11',     name: 'KOSPI',      flag: 'KR' },
  { symbol: '^BSESN',    name: 'SENSEX',     flag: 'IN' },
  // Russia
  { symbol: 'IMOEX.ME',  name: 'MOEX',       flag: 'RU' },
  // Other
  { symbol: '^BVSP',     name: 'BOVESPA',    flag: 'BR' },
];

// ── Types ───────────────────────────────────────────────────────────────────

export interface MarketQuote {
  symbol:        string;
  name:          string;
  flag:          string;
  price:         number | null;
  change:        number | null;
  changePercent: number | null;
  /** "REGULAR" | "PRE" | "POST" | "CLOSED" | "PREPRE" | "POSTPOST" */
  marketState:   string;
  /** True only during regular trading hours */
  isOpen:        boolean;
}

// ── In-memory quote cache ───────────────────────────────────────────────────

let _cache: { data: MarketQuote[]; ts: number } | null = null;
const CACHE_TTL = 60_000; // refresh at most once per minute

// ── Fetch helpers ────────────────────────────────────────────────────────────

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/** Determine market session from Yahoo's currentTradingPeriod timestamps. */
function computeMarketState(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ctp: Record<string, any> | undefined | null
): string {
  if (!ctp) return 'CLOSED';
  const now = Math.floor(Date.now() / 1000);
  if (ctp.regular && now >= ctp.regular.start && now <= ctp.regular.end) return 'REGULAR';
  if (ctp.pre     && now >= ctp.pre.start     && now <= ctp.pre.end)     return 'PRE';
  if (ctp.post    && now >= ctp.post.start    && now <= ctp.post.end)    return 'POST';
  return 'CLOSED';
}

/**
 * Fetch a single symbol via the Yahoo Finance v8 chart endpoint.
 * No auth / crumb required — works anonymously in all regions.
 */
async function fetchSymbol(market: MarketDef, signal: AbortSignal): Promise<MarketQuote> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/` +
    `${encodeURIComponent(market.symbol)}?interval=1m&range=1d`;

  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    signal,
    cache: 'no-store',
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as any;
  const meta = json?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error('no meta');

  const price     = (meta.regularMarketPrice   as number | undefined) ?? null;
  const prevClose = (meta.chartPreviousClose   as number | undefined)
                 ?? (meta.previousClose        as number | undefined)
                 ?? null;

  const change        = price != null && prevClose != null ? price - prevClose : null;
  const changePercent = change != null && prevClose        ? (change / prevClose) * 100 : null;
  const state         = computeMarketState(meta.currentTradingPeriod);

  return {
    symbol:        market.symbol,
    name:          market.name,
    flag:          market.flag,
    price,
    change,
    changePercent,
    marketState:   state,
    isOpen:        state === 'REGULAR',
  };
}

/** Fetch all markets in parallel; partial failures return null-price placeholders. */
async function fetchYahoo(): Promise<MarketQuote[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const settled = await Promise.allSettled(
      MARKETS.map((m) => fetchSymbol(m, controller.signal))
    );

    return settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      console.warn(`[markets] ${MARKETS[i].symbol}: ${(r.reason as Error).message}`);
      return {
        symbol:        MARKETS[i].symbol,
        name:          MARKETS[i].name,
        flag:          MARKETS[i].flag,
        price:         null,
        change:        null,
        changePercent: null,
        marketState:   'CLOSED',
        isOpen:        false,
      };
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ── Route handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const clientIp = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`${clientIp}:markets`, 6, 60_000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Serve fresh cache if available
  if (_cache && Date.now() - _cache.ts < CACHE_TTL) {
    return NextResponse.json({ quotes: _cache.data, cached: true });
  }

  try {
    const quotes = await fetchYahoo();
    // Only cache if we got at least some live prices
    if (quotes.some((q) => q.price != null)) {
      _cache = { data: quotes, ts: Date.now() };
    }
    return NextResponse.json({ quotes, cached: false });
  } catch (err) {
    console.error('[markets/quotes]', (err as Error).message);
    // Return stale cache if available so the ticker doesn't go blank
    if (_cache) {
      return NextResponse.json({ quotes: _cache.data, cached: true, stale: true });
    }
    return NextResponse.json({ quotes: [], error: 'Upstream unavailable' });
  }
}
