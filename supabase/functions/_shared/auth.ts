import { type DashboardClaims, readDashboardClaims } from './jwt.ts';

export type { DashboardClaims };

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

export async function dashboardClaims(req: Request): Promise<DashboardClaims | null> {
  const token = bearer(req);
  const secret = Deno.env.get('JWT_SECRET') || '';
  if (!token || !secret) return null;
  return readDashboardClaims(token, secret);
}

export async function dashboardAuthorized(req: Request): Promise<boolean> {
  return (await dashboardClaims(req)) !== null;
}

/** Parents may act for anyone. A kid may act only for their own person_id. */
export function canActFor(claims: DashboardClaims, personId: string): boolean {
  return claims.role === 'parent' || claims.personId === personId;
}

/** Dashboard session, or the optional ASSISTANT_TOKEN used by an external poller. */
export type RequestAuth = { kind: 'assistant' } | { kind: 'jwt'; claims: DashboardClaims };

export async function requestAuthorized(req: Request): Promise<RequestAuth | null> {
  const assistant = Deno.env.get('ASSISTANT_TOKEN') || '';
  const header = req.headers.get('x-assistant-token') || '';
  const token = bearer(req);
  if (assistant && (safeEqual(header, assistant) || safeEqual(token, assistant))) return { kind: 'assistant' };
  const claims = await dashboardClaims(req);
  return claims ? { kind: 'jwt', claims } : null;
}
