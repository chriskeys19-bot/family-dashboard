import { safeEqual } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/http.ts';
import { signJwt } from '../_shared/jwt.ts';

const fails = new Map<string, { count: number; until: number }>();

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const passwordSecret = Deno.env.get('DASHBOARD_PASSWORD') || '';
  const jwtSecret = Deno.env.get('JWT_SECRET') || '';
  if (!passwordSecret || !jwtSecret) return json({ error: 'missing_secret' }, 500);

  const ip = (req.headers.get('x-forwarded-for') || 'local').split(',')[0].trim();
  const state = fails.get(ip);
  if (state && state.until > Date.now()) return json({ error: 'slow_down' }, 429);

  let password = '';
  try {
    const body = await req.json();
    password = String(body?.password ?? '');
  } catch {
    password = '';
  }
  if (password.length > 200) password = password.slice(0, 200);

  const ok = password.length > 0 && safeEqual(password, passwordSecret);
  if (!ok) {
    const next = fails.get(ip) || { count: 0, until: 0 };
    next.count += 1;
    if (next.count >= 8) {
      next.until = Date.now() + 60_000;
      next.count = 0;
    }
    fails.set(ip, next);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return json({ error: 'wrong_password' }, 401);
  }
  fails.delete(ip);

  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 24 * 60 * 60;
  const issuer = Deno.env.get('SUPABASE_URL');
  const token = await signJwt({
    aud: 'authenticated',
    exp,
    iat: now,
    iss: issuer ? `${issuer}/auth/v1` : 'supabase',
    sub: '00000000-0000-4000-8000-0000000000fb',
    role: 'authenticated',
    aal: 'aal1',
    session_id: crypto.randomUUID(),
    email: 'dashboard@homeboard.local',
    app_metadata: { provider: 'dashboard', providers: ['dashboard'] },
    user_metadata: { dashboard: true },
    dashboard_access: true,
  }, jwtSecret);

  return json({ access_token: token, token_type: 'bearer', expires_at: exp, expires_in: exp - now });
});
