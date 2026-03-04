import DOMPurify from 'isomorphic-dompurify';
import { z } from 'zod';

export function sanitizeHTML(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'span'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

export const urlSchema = z.string().url().refine(
  (url) => {
    try {
      const parsed = new URL(url);
      const blocked = ['javascript:', 'data:', 'vbscript:', 'file:'];
      if (blocked.includes(parsed.protocol)) return false;
      const hostname = parsed.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname) ||
        hostname === '0.0.0.0' ||
        hostname === '::1'
      ) return false;
      return true;
    } catch {
      return false;
    }
  },
  { message: 'Invalid or blocked URL' }
);

export const apiKeySchema = z.string()
  .min(5)
  .max(256)
  .regex(/^[a-zA-Z0-9_\-\.@+:]+$/, 'API key contains invalid characters');

export function sanitizeSearchQuery(query: string): string {
  return query
    .replace(/[<>"';|`$(){}[\]\\]/g, '')
    .trim()
    .slice(0, 500);
}

export const bboxSchema = z.object({
  west: z.number().min(-180).max(180),
  south: z.number().min(-90).max(90),
  east: z.number().min(-180).max(180),
  north: z.number().min(-90).max(90),
});
