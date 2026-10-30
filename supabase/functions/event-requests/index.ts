import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { requestAuthorized } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  const auth = await requestAuthorized(req);
  if (!auth) return json({ error: 'unauthorized' }, 401);

  const admin = adminClient();
  if (!admin) return json({ error: 'missing_service_role' }, 500);

  if (req.method === 'GET') {
    const status = new URL(req.url).searchParams.get('status') || 'pending';
    return json({ requests: await listRequests(admin, status) });
  }

  if (req.method === 'POST') {
    let body: { action?: string; id?: string; status?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
    if (body.action === 'list') {
      return json({ requests: await listRequests(admin, body.status || 'pending') });
    }
    if (body.action === 'mark_handled') {
      const id = String(body.id || '');
      if (!id) return json({ error: 'bad_request' }, 400);
      const { data, error } = await admin
        .from('event_requests')
        .update({ status: 'handled', handled_at: new Date().toISOString() })
        .eq('id', id)
        .select('*, people(name)')
        .maybeSingle();
      if (error) return json({ error: 'update_failed' }, 500);
      if (!data) return json({ error: 'not_found' }, 404);
      return json({ request: flatten(data) });
    }
    return json({ error: 'bad_request' }, 400);
  }

  return json({ error: 'method_not_allowed' }, 405);
});

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function listRequests(admin: ReturnType<typeof createClient>, status: string) {
  let query = admin.from('event_requests').select('*, people(name)').order('starts_at', { ascending: true });
  if (status === 'pending' || status === 'requested') query = query.eq('status', 'requested');
  else if (status === 'handled') query = query.eq('status', 'handled');
  else if (status !== 'all') query = query.eq('status', 'requested');
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []).map(flatten);
}

function flatten(row: Record<string, unknown>) {
  const people = row.people as { name?: string } | null;
  const copy = { ...row };
  delete copy.people;
  return { ...copy, person_name: people?.name ?? null };
}
