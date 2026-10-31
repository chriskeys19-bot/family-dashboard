/** Keep the counters aligned with site/js/week.js */

export const DEFAULT_WEIGHT_KG = 40;

const MET: Record<string, number> = { practice: 5, game: 6, gym: 8 };

export function weekdayIndex(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function shiftISO(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export function weekRange(isoDate: string) {
  const start = shiftISO(isoDate, -weekdayIndex(isoDate));
  return { start, end: shiftISO(start, 6) };
}

export function inWeek(isoDate: string, range: { start: string; end: string }) {
  return isoDate >= range.start && isoDate <= range.end;
}

function round1(n: number) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function formatMinutes(minutes: number) {
  const n = Math.round(minutes);
  if (!n) return '0';
  if (n === 30) return '30 min';
  if (n === 60) return '1 hr';
  if (n === 90) return '1.5 hr';
  if (n === 120) return '2 hr';
  if (n === 150) return '2.5 hr';
  if (n === 180) return '3 hr+';
  if (n % 60 === 0) return `${n / 60} hr`;
  return `${n} min`;
}

export function runMet(mph: number) {
  const points = [[4, 6], [5, 8.3], [6, 9.8], [7, 11], [8, 11.8], [9, 12.8], [10, 14.5], [12, 18]];
  if (!Number.isFinite(mph) || mph <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    if (mph <= points[i][0]) {
      const [s0, m0] = points[i - 1];
      const [s1, m1] = points[i];
      return m0 + ((m1 - m0) * (mph - s0)) / (s1 - s0);
    }
  }
  return points[points.length - 1][1];
}

function scheduledMinutes(startsAt: string, endsAt: string) {
  const ms = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  const minutes = Math.round(ms / 60000);
  if (minutes < 1 || minutes > 24 * 60) return 0;
  return minutes;
}

function pacificDate(iso: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function reflectionText(row: Record<string, unknown> | null) {
  if (!row) return '';
  return [row.learned, row.went_well, row.next_time].filter(Boolean).join(' ').trim();
}

type Person = { id: string; name: string; weight_kg?: number | null };
type Row = Record<string, any>;

export function summarizeWeek(input: {
  person: Person;
  events: Row[];
  completions: Row[];
  reflections: Row[];
  training: Row[];
  nutrition: Row[];
  range: { start: string; end: string };
}) {
  const { person, events, completions, reflections, training, nutrition, range } = input;
  const kg = Number(person.weight_kg) > 0 ? Number(person.weight_kg) : DEFAULT_WEIGHT_KG;
  let cricketMinutes = 0;
  let gymMinutes = 0;
  let gymSessions = 0;
  let burned = 0;
  const weekReflections: Row[] = [];

  for (const completion of completions || []) {
    if (completion.person_id !== person.id || completion.item_type !== 'event' || !completion.completed_at) continue;
    if (!inWeek(completion.occurrence_on, range)) continue;
    const event = (events || []).find((row) => row.id === completion.item_id);
    if (!event || event.status !== 'confirmed') continue;
    const kind = event.category_id === 'cricket-practice'
      ? 'practice'
      : event.category_id === 'cricket-games'
        ? 'game'
        : event.category_id === 'gym'
          ? 'gym'
          : '';
    if (!kind) continue;
    const reflection = (reflections || []).find((row) => row.person_id === person.id
      && row.event_id === event.id
      && row.occurrence_on === completion.occurrence_on) || null;
    const logged = Number(reflection?.duration_minutes);
    const minutes = kind !== 'gym' && logged > 0 ? logged : scheduledMinutes(event.starts_at, event.ends_at);
    if (kind === 'gym') {
      gymSessions += 1;
      gymMinutes += minutes;
    } else cricketMinutes += minutes;
    burned += MET[kind] * kg * (minutes / 60);
    if (reflection) weekReflections.push(reflection);
  }

  let miles = 0;
  let longest: Row | null = null;
  for (const row of training || []) {
    if (row.person_id !== person.id || !inWeek(row.trained_on, range)) continue;
    const distanceM = Number(row.distance_m) || 0;
    const hours = (Number(row.duration_seconds) || 0) / 3600;
    const rowMiles = distanceM / 1609.344;
    miles += rowMiles;
    if (hours > 0 && rowMiles > 0) burned += runMet(rowMiles / hours) * kg * hours;
    if (!longest || distanceM > longest.distance_m) longest = row;
  }

  let calories = 0;
  let protein = 0;
  for (const row of nutrition || []) {
    if (row.person_id !== person.id || row.source === 'note' || row.calories == null) continue;
    if (!inWeek(pacificDate(row.eaten_at), range)) continue;
    calories += Number(row.calories) || 0;
    protein += Number(row.protein_g) || 0;
  }

  for (const row of reflections || []) {
    if (row.person_id === person.id && inWeek(row.occurrence_on, range) && !weekReflections.includes(row)) {
      weekReflections.push(row);
    }
  }
  const best = weekReflections.slice().sort((a, b) => reflectionText(b).length - reflectionText(a).length)[0] || null;

  return {
    person_id: person.id,
    name: person.name,
    weight_kg: round1(kg),
    cricket_minutes: cricketMinutes,
    cricket_hours: round1(cricketMinutes / 60),
    cricket_label: formatMinutes(cricketMinutes),
    miles_run: round1(miles),
    gym_sessions: gymSessions,
    gym_minutes: gymMinutes,
    gym_hours: round1(gymMinutes / 60),
    gym_label: formatMinutes(gymMinutes),
    calories_eaten: Math.round(calories),
    protein_g: round1(protein),
    calories_burned: Math.round(burned),
    approximate: true,
    highlights: {
      best_reflection: best ? {
        event_id: best.event_id,
        occurrence_on: best.occurrence_on,
        kind: best.kind,
        feel: best.feel || null,
        text: reflectionText(best),
      } : null,
      longest_run: longest ? {
        trained_on: longest.trained_on,
        miles: round1((Number(longest.distance_m) || 0) / 1609.344),
        duration_seconds: Number(longest.duration_seconds) || 0,
        session_type: longest.session_type,
      } : null,
    },
  };
}

export function summarizeFamily(boys: Array<ReturnType<typeof summarizeWeek>>) {
  const totals = boys.reduce((sum, boy) => ({
    cricket_minutes: sum.cricket_minutes + boy.cricket_minutes,
    miles_run: sum.miles_run + boy.miles_run,
    gym_sessions: sum.gym_sessions + boy.gym_sessions,
    gym_minutes: sum.gym_minutes + boy.gym_minutes,
    calories_eaten: sum.calories_eaten + boy.calories_eaten,
    protein_g: sum.protein_g + boy.protein_g,
    calories_burned: sum.calories_burned + boy.calories_burned,
  }), {
    cricket_minutes: 0, miles_run: 0, gym_sessions: 0, gym_minutes: 0, calories_eaten: 0, protein_g: 0, calories_burned: 0,
  });
  const best = boys.map((boy) => boy.highlights.best_reflection).filter(Boolean)
    .sort((a, b) => (b!.text || '').length - (a!.text || '').length)[0] || null;
  const longest = boys.map((boy) => boy.highlights.longest_run).filter(Boolean)
    .sort((a, b) => b!.miles - a!.miles)[0] || null;
  return {
    name: 'Both boys',
    ...totals,
    miles_run: round1(totals.miles_run),
    protein_g: round1(totals.protein_g),
    cricket_hours: round1(totals.cricket_minutes / 60),
    gym_hours: round1(totals.gym_minutes / 60),
    cricket_label: formatMinutes(totals.cricket_minutes),
    gym_label: formatMinutes(totals.gym_minutes),
    approximate: true,
    highlights: { best_reflection: best, longest_run: longest },
  };
}
