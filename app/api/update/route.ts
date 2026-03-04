export const runtime = 'nodejs';

import { execSync } from 'child_process';
import { NextResponse } from 'next/server';
import { rateLimit } from '@/lib/security/rateLimit';

function exec(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', timeout: 30000 }).trim();
}

export async function GET(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local';
  if (!rateLimit(`update-check:${ip}`, 10, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    exec('git fetch origin main --quiet');
    const current = exec('git rev-parse HEAD');
    const latest = exec('git rev-parse origin/main');
    const hasUpdates = current !== latest;
    const changes = hasUpdates
      ? exec('git log HEAD..origin/main --oneline --no-decorate').split('\n').filter(Boolean)
      : [];

    return NextResponse.json({
      current: current.slice(0, 7),
      latest: latest.slice(0, 7),
      hasUpdates,
      changes,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for') ?? 'local';
  if (!rateLimit(`update-apply:${ip}`, 3, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  try {
    const output = exec('git pull origin main');
    return NextResponse.json({ success: true, output, needsRestart: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
