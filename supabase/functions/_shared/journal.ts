/** Keep suggestion text aligned with site/js/recap.js */

type Person = { id: string; name?: string };
type Row = Record<string, unknown>;

function isoDay(value: string, timeZone = 'America/Los_Angeles') {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function shiftDate(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function touches(startsAt: string, endsAt: string, isoDate: string) {
  const startDay = isoDay(startsAt);
  const endDay = isoDay(endsAt);
  return startDay === isoDate || endDay === isoDate || (startDay < isoDate && endDay > isoDate);
}

function sumMeals(meals: Row[]) {
  const estimated = meals.filter((row) => row.source !== 'note' && row.calories != null);
  const num = (row: Row, key: string) => Number(row[key]) || 0;
  return {
    calories: estimated.reduce((sum, row) => sum + num(row, 'calories'), 0),
    protein_g: Math.round(estimated.reduce((sum, row) => sum + num(row, 'protein_g'), 0) * 10) / 10,
    carbs_g: Math.round(estimated.reduce((sum, row) => sum + num(row, 'carbs_g'), 0) * 10) / 10,
    fat_g: Math.round(estimated.reduce((sum, row) => sum + num(row, 'fat_g'), 0) * 10) / 10,
    estimated_meals: estimated.length,
    logged_meals: meals.length,
  };
}

export function assembleJournal({
  person,
  date,
  events = [],
  completions = [],
  reflections = [],
  training = [],
  nutrition = [],
  notes = [],
  needs = [],
}: {
  person: Person;
  date: string;
  events?: Row[];
  completions?: Row[];
  reflections?: Row[];
  training?: Row[];
  nutrition?: Row[];
  notes?: Row[];
  needs?: Row[];
}) {
  const id = person.id;
  const runs = training.filter((row) => row.person_id === id && row.trained_on === date);
  const meals = nutrition.filter((row) => row.person_id === id && isoDay(String(row.eaten_at)) === date);
  const recap = buildRecap({
    person,
    events,
    nutrition,
    training,
    completions,
    todayISO: shiftDate(date, 1),
  });
  return {
    person_id: id,
    person_name: person.name || id,
    date,
    timezone: 'America/Los_Angeles',
    completions,
    reflections,
    runs,
    meals,
    meal_totals: sumMeals(meals),
    notes,
    needs,
    recap,
  };
}

function buildRecap({
  person,
  events,
  nutrition,
  training,
  completions,
  todayISO,
}: {
  person: Person;
  events: Row[];
  nutrition: Row[];
  training: Row[];
  completions: Row[];
  todayISO: string;
}) {
  const yesterday = shiftDate(todayISO, -1);
  const scheduled = events.filter((event) => Array.isArray(event.people) && event.people.includes(person.id)
    && event.status === 'confirmed'
    && touches(String(event.starts_at), String(event.ends_at), yesterday));
  const done = (eventId: string) => completions.some((row) => row.person_id === person.id
    && row.item_type === 'event'
    && row.item_id === eventId
    && row.occurrence_on === yesterday
    && row.completed_at);
  const doneEvents = scheduled.filter((event) => done(String(event.id)));
  const missedEvents = scheduled.filter((event) => !done(String(event.id)));
  const meals = nutrition.filter((row) => row.person_id === person.id && isoDay(String(row.eaten_at)) === yesterday);
  const sessions = training.filter((row) => row.person_id === person.id && row.trained_on === yesterday);
  const suggestions: string[] = [];
  if (missedEvents.some((event) => event.category_id === 'cricket-practice')) {
    suggestions.push('Practice was on the list without a check. If you were there, you can still mark it. If not, today is a fresh page.');
  } else if (missedEvents.length) {
    suggestions.push('One thing stayed unchecked. Mark it if it happened — no speech required.');
  }
  if (!meals.length) suggestions.push('No meals got logged yesterday. A rough note is enough, even after the fact.');
  if (!sessions.length) suggestions.push('No training log yesterday. If you ran, jot it down. If you rested, that can be the plan.');
  const picked = suggestions.slice(0, 2);
  if (!picked.length) picked.push('Yesterday looks covered. That’s a solid day.');
  return {
    yesterday,
    suggestions: picked,
    doneCount: doneEvents.length + meals.length + sessions.length,
    missedCount: missedEvents.length,
    doneEvents,
    missedEvents,
    meals,
    sessions,
  };
}
