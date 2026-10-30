/**
 * The only place the front end reads connection settings.
 * Leave the Supabase fields blank to run in demo mode (bundled seed + localStorage).
 * The real shared password is NOT stored here. It is the DASHBOARD_PASSWORD secret
 * checked by the auth-gate Edge Function. DEMO_PASSWORD is public and demo-only.
 */
export const CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  DEMO_PASSWORD: 'family',
};

export function isDemoMode() {
  const url = (CONFIG.SUPABASE_URL || '').trim();
  const key = (CONFIG.SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return true;
  if (/YOUR_|<.*>|example\.supabase/.test(`${url} ${key}`)) return true;
  return false;
}
