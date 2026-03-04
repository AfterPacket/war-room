import dns from 'dns/promises';

const BLOCKED_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^fc00:/,
  /^fe80:/,
  /^::1$/,
  /^localhost$/i,
];

export async function validateExternalUrl(urlString: string): Promise<boolean> {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) return false;
    if (BLOCKED_RANGES.some((r) => r.test(url.hostname))) return false;

    try {
      const addresses = await dns.resolve4(url.hostname);
      return !addresses.some((ip) => BLOCKED_RANGES.some((r) => r.test(ip)));
    } catch {
      // DNS resolution failed — allow (don't block on DNS failure)
      return true;
    }
  } catch {
    return false;
  }
}

export function isBlockedHostname(hostname: string): boolean {
  return BLOCKED_RANGES.some((r) => r.test(hostname));
}
