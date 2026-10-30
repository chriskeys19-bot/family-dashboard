import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { safeEqual } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/http.ts';
import { assembleJournal } from '../_shared/journal.ts';

Deno.serve(async (req) => {
  const early = preflight(req);
  if (early) return early;
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const expected = Deno.env.get('JOURNAL_EXPORT_TOKEN') || '';
  if (!expected) return json({ error: 'missing_secret' }, 500);
  const header = req.headers.get('x-journal-token') || '';
  const auth = req.headers.get('authorization') || '';
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  if (!safeEqual(header, expected) && !safeEqual(bearer, expected)) return json({ error: 'unauthorized' }, 401);

  const url = new URL(req.url);
  let personId = url.searchParams.get('person_id') || '';
  let date = url.searchParams.get('date') || '';
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      personId = String(body?.person_id || personId);
      date = String(body?.date || date);
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
  }
  if (!/^[a-z0-9_-]{1,64}$/.test(personId) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ error: 'bad_request' }, 400);
  }

  const admin = adminClient();
  if (!admin) return json({ error: 'missing_service_role' }, 500);
  const { data: person, error: personError } = await admin.from('people').select('id,name,role').eq('id', personId).maybeSingle();
  if (personError) return json({ error: 'lookup_failed' }, 500);
  if (!person || person.role !== 'kid') return json({ error: 'unknown_kid' }, 404);

  const bounds = pacificBounds(date);
  const [events, completions, reflections, training, nutrition, notes, needs] = await Promise.all([
    admin.from('events').select('*').contains('people', [personId]),
    admin.from('completions').select('*').eq('person_id', personId),
    admin.from('session_reflections').select('*').eq('person_id', personId),
    admin.from('training_entries').select('*').eq('person_id', personId).eq('trained_on', date),
    admin.from('nutrition_entries').select('*').eq('person_id', personId).gte('eaten_at', bounds.start).lt('eaten_at', bounds.end),
    admin.from('kid_notes').select('*').eq('person_id', personId).gte('created_at', bounds.start).lt('created_at', bounds.end),
    admin.from('kid_needs').select('*').eq('person_id', personId),
  ]);
  const failed = [events, completions, reflections, training, nutrition, notes, needs].find((result) => result.error);
  if (failed?.error) return json({ error: 'lookup_failed' }, 500);

  const journal = assembleJournal({
    person,
    date,
    events: events.data || [],
    completions: (completions.data || []).filter((row) => row.occurrence_on === date || inBounds(row.completed_at, bounds)),
    reflections: (reflections.data || []).filter((row) => row.occurrence_on === date || inBounds(row.updated_at, bounds)),
    training: training.data || [],
    nutrition: nutrition.data || [],
    notes: notes.data || [],
    needs: (needs.data || []).filter((row) => inBounds(row.created_at, bounds) || inBounds(row.updated_at, bounds)),
  });
  return json(journal);
});

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function pacificBounds(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const start = wall(y, m, d);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = wall(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate());
  return { start: start.toISOString(), end: end.toISOString() };
}

function wall(y: number, m: number, d: number) {
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let offset = zoneOffset(new Date(utcGuess));
  let instant = new Date(utcGuess - offset);
  for (let i = 0; i < 2; i += 1) {
    const next = zoneOffset(instant);
    if (next === offset) break;
    offset = next;
    instant = new Date(utcGuess - offset);
  }
  return instant;
}

function zoneOffset(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return asUTC - date.getTime();
}

function inBounds(iso: string | null, bounds: { start: string; end: string }) {
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return time >= new Date(bounds.start).getTime() && time < new Date(bounds.end).getTime();
}
