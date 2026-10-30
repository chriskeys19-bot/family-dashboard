import { verifyDashboardJwt } from './jwt.ts';

export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const left = enc.encode(a);
  const right = enc.encode(b);
  const len = Math.max(left.length, right.length, 1);
  let diff = left.length ^ right.length;
  for (let i = 0; i < len; i += 1) diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  return diff === 0;
}

export function bearer(req: Request): string {
  const auth = req.headers.get('authorization') || '';
  return auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
}

export async function dashboardAuthorized(req: Request): Promise<boolean> {
  const token = bearer(req);
  const secret = Deno.env.get('JWT_SECRET') || '';
  if (!token || !secret) return false;
  return verifyDashboardJwt(token, secret);
}

/** Dashboard session, or the optional ASSISTANT_TOKEN used by an external poller. */
export async function requestAuthorized(req: Request): Promise<'jwt' | 'assistant' | null> {
  const assistant = Deno.env.get('ASSISTANT_TOKEN') || '';
  const header = req.headers.get('x-assistant-token') || '';
  const token = bearer(req);
  if (assistant && (safeEqual(header, assistant) || safeEqual(token, assistant))) return 'assistant';
  if (await dashboardAuthorized(req)) return 'jwt';
  return null;
}
