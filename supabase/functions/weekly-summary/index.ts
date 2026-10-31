import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { safeEqual } from '../_shared/auth.ts';
import { json, preflight } from '../_shared/http.ts';
import { shiftISO, summarizeFamily, summarizeWeek, weekdayIndex } from '../_shared/week.ts';

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
  let weekStart = url.searchParams.get('week_start') || '';
  let personId = url.searchParams.get('person_id') || '';
  if (req.method === 'POST') {
    try {
      const body = await req.json();
      weekStart = String(body?.week_start || weekStart);
      personId = String(body?.person_id || personId);
    } catch {
      return json({ error: 'bad_request' }, 400);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart) || weekdayIndex(weekStart) !== 0) {
    return json({ error: 'week_start_must_be_sunday' }, 400);
  }
  if (personId && !/^[a-z0-9_-]{1,64}$/.test(personId)) return json({ error: 'bad_request' }, 400);

  const admin = adminClient();
  if (!admin) return json({ error: 'missing_service_role' }, 500);

  let peopleQuery = admin.from('people').select('id,name,role').eq('role', 'kid').order('sort_order');
  if (personId) peopleQuery = admin.from('people').select('id,name,role').eq('id', personId).eq('role', 'kid');
  const people = await peopleQuery;
  if (people.error) return json({ error: 'lookup_failed' }, 500);
  const boys = people.data || [];
  if (personId && !boys.length) return json({ error: 'unknown_kid' }, 404);
  const ids = boys.map((boy) => boy.id);
  if (!ids.length) {
    return json({
      timezone: 'America/Los_Angeles',
      week_start: weekStart,
      week_end: shiftISO(weekStart, 6),
      previous_week_start: shiftISO(weekStart, -7),
      approximate: true,
      boys: [],
      family: null,
    });
  }

  const weekEnd = shiftISO(weekStart, 6);
  const bounds = { start: pacificMidnight(weekStart), end: pacificMidnight(shiftISO(weekEnd, 1)) };
  const [settings, events, completions, reflections, training, nutrition] = await Promise.all([
    admin.from('person_settings').select('person_id,weight_kg').in('person_id', ids),
    admin.from('events').select('id,starts_at,ends_at,people,category_id,status'),
    admin.from('completions').select('*').in('person_id', ids).gte('occurrence_on', weekStart).lte('occurrence_on', weekEnd),
    admin.from('session_reflections').select('*').in('person_id', ids).gte('occurrence_on', weekStart).lte('occurrence_on', weekEnd),
    admin.from('training_entries').select('*').in('person_id', ids).gte('trained_on', weekStart).lte('trained_on', weekEnd),
    admin.from('nutrition_entries').select('*').in('person_id', ids).gte('eaten_at', bounds.start).lt('eaten_at', bounds.end),
  ]);
  const failed = [settings, events, completions, reflections, training, nutrition].find((result) => result.error);
  if (failed?.error) return json({ error: 'lookup_failed' }, 500);

  const weight = new Map((settings.data || []).map((row) => [row.person_id, Number(row.weight_kg)]));
  const range = { start: weekStart, end: weekEnd };
  const summaries = boys.map((boy) => summarizeWeek({
    person: { id: boy.id, name: boy.name, weight_kg: weight.get(boy.id) || null },
    events: events.data || [],
    completions: completions.data || [],
    reflections: reflections.data || [],
    training: training.data || [],
    nutrition: nutrition.data || [],
    range,
  }));

  return json({
    timezone: 'America/Los_Angeles',
    week_start: weekStart,
    week_end: weekEnd,
    previous_week_start: shiftISO(weekStart, -7),
    approximate: true,
    boys: summaries,
    family: personId ? null : summarizeFamily(summaries),
  });
});

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function pacificMidnight(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let offset = zoneOffset(new Date(utcGuess));
  let instant = new Date(utcGuess - offset);
  for (let i = 0; i < 2; i += 1) {
    const next = zoneOffset(instant);
    if (next === offset) break;
    offset = next;
    instant = new Date(utcGuess - offset);
  }
  return instant.toISOString();
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
