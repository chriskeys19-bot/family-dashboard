import { formatPracticeDuration, scheduledMinutes } from './practice-duration.js';
import { formatISODate, shiftISODate } from './time.js';

export const DEFAULT_WEIGHT_KG = 40;
export const LB_PER_KG = 2.2046226218;

const MET = { practice: 5, game: 6, gym: 8 };

export function weekdayIndex(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Sunday–Saturday range that contains this Pacific calendar date. */
export function weekRange(isoDate) {
  const start = shiftISODate(isoDate, -weekdayIndex(isoDate));
  return { start, end: shiftISODate(start, 6) };
}

export function previousWeek(range) {
  return { start: shiftISODate(range.start, -7), end: shiftISODate(range.end, -7) };
}

export function inWeek(isoDate, range) {
  return isoDate >= range.start && isoDate <= range.end;
}

export function kgToLb(kg) {
  return Math.round((Number(kg) || DEFAULT_WEIGHT_KG) * LB_PER_KG);
}

export function lbToKg(lb) {
  return Math.round((Number(lb) / LB_PER_KG) * 10) / 10;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function weightKg(person) {
  const kg = Number(person?.weight_kg);
  return Number.isFinite(kg) && kg > 0 ? kg : DEFAULT_WEIGHT_KG;
}

/** MET from running speed. Points follow common compendium values. */
export function runMet(mph) {
  const points = [[4, 6], [5, 8.3], [6, 9.8], [7, 11], [8, 11.8], [9, 12.8], [10, 14.5], [12, 18]];
  const speed = Number(mph);
  if (!Number.isFinite(speed) || speed <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    if (speed <= points[i][0]) {
      const [s0, m0] = points[i - 1];
      const [s1, m1] = points[i];
      return m0 + ((m1 - m0) * (speed - s0)) / (s1 - s0);
    }
  }
  return points[points.length - 1][1];
}

function reflectionFor(reflections, personId, eventId, day) {
  return (reflections || []).find((row) => row.person_id === personId
    && row.event_id === eventId
    && row.occurrence_on === day) || null;
}

function reflectionText(row) {
  return [row?.learned, row?.went_well, row?.next_time].filter(Boolean).join(' ').trim();
}

function burn(met, kg, minutes) {
  return met * kg * (minutes / 60);
}

export function summarizeWeek({ person, events, completions, reflections, training, nutrition, range }) {
  const kg = weightKg(person);
  let cricketMinutes = 0;
  let gymMinutes = 0;
  let gymSessions = 0;
  let burned = 0;
  const weekReflections = [];

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
    const day = completion.occurrence_on;
    const scheduled = scheduledMinutes(event.starts_at, event.ends_at) || 0;
    const reflection = reflectionFor(reflections, person.id, event.id, day);
    const logged = Number(reflection?.duration_minutes);
    const minutes = kind !== 'gym' && logged > 0 ? logged : scheduled;
    if (kind === 'gym') {
      gymSessions += 1;
      gymMinutes += minutes;
    } else {
      cricketMinutes += minutes;
    }
    burned += burn(MET[kind], kg, minutes);
    if (reflection) weekReflections.push(reflection);
  }

  let miles = 0;
  let longest = null;
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
    if (!inWeek(formatISODate(row.eaten_at), range)) continue;
    calories += Number(row.calories) || 0;
    protein += Number(row.protein_g) || 0;
  }

  for (const row of reflections || []) {
    if (row.person_id === person.id && inWeek(row.occurrence_on, range) && !weekReflections.includes(row)) {
      weekReflections.push(row);
    }
  }
  const best = weekReflections
    .slice()
    .sort((a, b) => reflectionText(b).length - reflectionText(a).length)[0] || null;

  return {
    person_id: person.id,
    name: person.name,
    weight_kg: round1(kg),
    weight_lb: kgToLb(kg),
    cricket_minutes: cricketMinutes,
    cricket_hours: round1(cricketMinutes / 60),
    cricket_label: cricketMinutes ? formatPracticeDuration(cricketMinutes) : '0',
    miles_run: round1(miles),
    gym_sessions: gymSessions,
    gym_minutes: gymMinutes,
    gym_hours: round1(gymMinutes / 60),
    gym_label: gymMinutes ? formatPracticeDuration(gymMinutes) : '0',
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

export function summarizeFamily(boys) {
  const totals = boys.reduce((sum, boy) => ({
    cricket_minutes: sum.cricket_minutes + boy.cricket_minutes,
    miles_run: sum.miles_run + boy.miles_run,
    gym_sessions: sum.gym_sessions + boy.gym_sessions,
    gym_minutes: sum.gym_minutes + boy.gym_minutes,
    calories_eaten: sum.calories_eaten + boy.calories_eaten,
    protein_g: sum.protein_g + boy.protein_g,
    calories_burned: sum.calories_burned + boy.calories_burned,
  }), {
    cricket_minutes: 0,
    miles_run: 0,
    gym_sessions: 0,
    gym_minutes: 0,
    calories_eaten: 0,
    protein_g: 0,
    calories_burned: 0,
  });
  const best = boys
    .map((boy) => boy.highlights.best_reflection)
    .filter(Boolean)
    .sort((a, b) => (b.text || '').length - (a.text || '').length)[0] || null;
  const longest = boys
    .map((boy) => boy.highlights.longest_run)
    .filter(Boolean)
    .sort((a, b) => b.miles - a.miles)[0] || null;
  return {
    name: 'Both boys',
    ...totals,
    miles_run: round1(totals.miles_run),
    protein_g: round1(totals.protein_g),
    cricket_hours: round1(totals.cricket_minutes / 60),
    gym_hours: round1(totals.gym_minutes / 60),
    cricket_label: totals.cricket_minutes ? formatPracticeDuration(totals.cricket_minutes) : '0',
    gym_label: totals.gym_minutes ? formatPracticeDuration(totals.gym_minutes) : '0',
    approximate: true,
    highlights: { best_reflection: best, longest_run: longest },
  };
}
