/**
 * Single source for demo JSON and supabase/seed.sql.
 * Run: node scripts/generate-seed.mjs
 *
 * Recurring practices, gym, and academics are generated from 2026-10-30
 * through 2026-12-31 in America/Los_Angeles, skipping Houston tournament
 * dates (Nov 21–24 and Nov 26–29). Game clocks include the 1 hour warm-up.
 */
import { writeFileSync } from 'node:fs';

const SKIP = new Set([
  '2026-11-21',
  '2026-11-22',
  '2026-11-23',
  '2026-11-24',
  '2026-11-26',
  '2026-11-27',
  '2026-11-28',
  '2026-11-29',
]);

const people = [
  { id: 'ben', name: 'Ben', role: 'parent', sort_order: 1 },
  { id: 'sangeetha', name: 'Sangeetha', role: 'parent', sort_order: 2 },
  { id: 'yuvan', name: 'Yuvan', role: 'kid', sort_order: 3 },
  { id: 'varun', name: 'Varun', role: 'kid', sort_order: 4 },
];

const categories = [
  { id: 'cricket-games', label: 'Cricket Games', color: '#1f6b45', icon: 'cricket', sort_order: 1, visible_to_kids: true },
  { id: 'cricket-practice', label: 'Cricket Practice', color: '#2a6f8f', icon: 'practice', sort_order: 2, visible_to_kids: true },
  { id: 'gym', label: 'Gym', color: '#c4622d', icon: 'gym', sort_order: 3, visible_to_kids: true },
  { id: 'social', label: 'Social', color: '#7a4e8a', icon: 'social', sort_order: 4, visible_to_kids: true },
  { id: 'tournament', label: 'Tournament', color: '#9b2335', icon: 'trophy', sort_order: 5, visible_to_kids: true },
  { id: 'academics', label: 'Academics', color: '#3d5a80', icon: 'book', sort_order: 6, visible_to_kids: true },
];

function offsetFor(date) {
  // DST ends 2:00 AM on Sun Nov 1, 2026. Daytime on Nov 1 is already PST.
  return date < '2026-11-01' ? '-07:00' : '-08:00';
}

function at(date, hhmm) {
  return `${date}T${hhmm}:00${offsetFor(date)}`;
}

function eachDate(start, end, weekday) {
  const dates = [];
  let cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    if (cursor.getUTCDay() === weekday) dates.push(cursor.toISOString().slice(0, 10));
    cursor = new Date(cursor.getTime() + 86400000);
  }
  return dates;
}

function event(row) {
  return {
    all_day: false,
    multi_day: false,
    source: 'seed',
    notes: '',
    ...row,
  };
}

const events = [];

const games = [
  ['2026-11-01', '07:45', '13:00', 'confirmed', ['varun'], 'Cheetahs Beta vs Livermore Monks', 'Anthony Ochoa Middle School, 2121 Depot Rd, Hayward'],
  ['2026-11-01', '07:45', '13:00', 'confirmed', ['yuvan'], 'Indus Conquest vs Strikers White', 'Fremont Central Park, 1110-1166 Stevenson Blvd, Fremont'],
  ['2026-11-01', '11:45', '17:15', 'not_picked', ['varun'], 'UC Cubs vs Santa Clara Pandas', 'Wilson High School, 1840 Benton St, Santa Clara'],
  ['2026-11-01', '11:45', '17:15', 'confirmed', ['yuvan', 'varun'], 'Cheetahs Alpha vs Cougars Black', 'Birch Grove, 37490 Birch St, Newark'],
  ['2026-11-07', '11:45', '17:15', 'potential', ['varun'], 'Cheetahs Beta vs Strikers Blue 2', 'Taarika Foundation Ground, 1185 Fisher Ave, Morgan Hill'],
  ['2026-11-08', '07:45', '13:00', 'potential', ['varun'], 'UC Cubs vs SV Lions', 'Seabreeze Park, 32600 Carmel Way, Union City'],
  ['2026-11-08', '07:45', '13:00', 'potential', ['yuvan'], 'Cheetahs Alpha vs Tracy Centurions', 'Birch Grove, 37490 Birch St, Newark'],
  ['2026-11-14', '07:45', '13:00', 'potential', ['yuvan'], 'Indus Conquest vs BT Warriors', 'Fremont Central Park, 1110-1166 Stevenson Blvd, Fremont'],
  ['2026-11-14', '11:45', '17:15', 'potential', ['yuvan'], 'Cheetahs Alpha vs Indus Dukes', 'Fremont Central Park, 1110-1166 Stevenson Blvd, Fremont'],
  ['2026-11-14', '11:45', '17:15', 'potential', ['varun'], 'Cheetahs Beta vs Strong Arm', 'Anthony Ochoa Middle School, 2121 Depot Rd, Hayward'],
  ['2026-11-22', '07:45', '13:00', 'potential', ['yuvan'], 'Indus Conquest vs Cheetahs Gamma', 'Anthony Ochoa Middle School, 2121 Depot Rd, Hayward'],
];

for (const [date, start, end, status, peopleIds, title, location] of games) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  events.push(event({
    id: `game-${date}-${peopleIds.join('-')}-${slug}`,
    title,
    starts_at: at(date, start),
    ends_at: at(date, end),
    location,
    people: peopleIds,
    category_id: 'cricket-games',
    status,
    notes: 'Game window includes 1 hour warm-up.',
  }));
}

for (const [person, dates] of [
  ['yuvan', ['2026-12-05', '2026-12-12', '2026-12-20']],
  ['varun', ['2026-12-06', '2026-12-13', '2026-12-19']],
]) {
  for (const date of dates) {
    const next = new Date(`${date}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const nextDate = next.toISOString().slice(0, 10);
    events.push(event({
      id: `game-${date}-${person}-tbd`,
      title: 'Game day (details TBD)',
      starts_at: at(date, '00:00'),
      ends_at: `${nextDate}T00:00:00${offsetFor(nextDate)}`,
      all_day: true,
      location: '',
      people: [person],
      category_id: 'cricket-games',
      status: 'potential',
      notes: 'Details TBD.',
    }));
  }
}

const tournaments = [
  ['2026-11-21', '2026-11-24', 'varun', 'AMLCA U13 Top 8, MSCA Avengers'],
  ['2026-11-21', '2026-11-24', 'yuvan', 'AMLCA U15 Top 8, MSCA Blazers'],
  ['2026-11-26', '2026-11-29', 'varun', 'NYCT U15, HYCC Suns'],
  ['2026-11-26', '2026-11-29', 'yuvan', 'NYCT U17, MACS'],
];

for (const [startDate, endDate, person, title] of tournaments) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  events.push(event({
    id: `tourn-${startDate}-${person}-${slug}`,
    title,
    starts_at: at(startDate, '06:00'),
    ends_at: at(endDate, '15:00'),
    multi_day: true,
    location: 'Houston, TX',
    people: [person],
    category_id: 'tournament',
    status: 'confirmed',
    notes: 'Daily 6:00 AM–3:00 PM PT.',
  }));
}

function addRecurring({ idPrefix, dates, start, end, title, location, peopleIds, category_id, notes }) {
  for (const date of dates) {
    if (SKIP.has(date)) continue;
    events.push(event({
      id: `${idPrefix}-${date}`,
      title,
      starts_at: at(date, start),
      ends_at: at(date, end),
      location,
      people: peopleIds,
      category_id,
      status: 'confirmed',
      notes,
    }));
  }
}

const both = ['yuvan', 'varun'];
const thursday = eachDate('2026-10-30', '2026-12-31', 4);
const friday = eachDate('2026-10-30', '2026-12-31', 5);
const wednesday = eachDate('2026-10-30', '2026-12-31', 3);
const saturday = eachDate('2026-10-30', '2026-12-31', 6);

addRecurring({
  idPrefix: 'practice-blazers',
  dates: [...thursday, ...friday],
  start: '18:00',
  end: '21:15',
  title: 'Blazers Elite Pro/Premium',
  location: 'FICC Fremont',
  peopleIds: both,
  category_id: 'cricket-practice',
  notes: 'Recurring Thu and Fri.',
});

addRecurring({
  idPrefix: 'practice-cheetahs',
  dates: wednesday,
  start: '20:30',
  end: '22:00',
  title: 'Cheetahs practice',
  location: 'US Cricket Store, Milpitas',
  peopleIds: both,
  category_id: 'cricket-practice',
  notes: 'Recurring Wed.',
});

addRecurring({
  idPrefix: 'practice-cric-kingdom',
  dates: saturday,
  start: '17:15',
  end: '19:30',
  title: 'Cric Kingdom',
  location: 'US Cricket Store, 121 Ranch Dr, Milpitas',
  peopleIds: both,
  category_id: 'cricket-practice',
  notes: 'Recurring Sat.',
});

addRecurring({
  idPrefix: 'gym-toy-soldier',
  dates: friday,
  start: '18:15',
  end: '19:30',
  title: 'Toy Soldier gym (CrossFit)',
  location: '110 N 33rd St, San Jose',
  peopleIds: both,
  category_id: 'gym',
  notes: 'End time TBD; shown until 7:30 PM for layout. Overlaps Friday Blazers practice.',
});

addRecurring({
  idPrefix: 'academics-rsm',
  dates: thursday,
  start: '15:30',
  end: '18:15',
  title: 'RSM class',
  location: 'RSM Milpitas',
  peopleIds: ['yuvan'],
  category_id: 'academics',
  notes: 'Yuvan only. Recurring Thu.',
});

events.sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id));

const seed = {
  timezone: 'America/Los_Angeles',
  window: { start: '2026-10-30', end: '2026-12-31' },
  houston_skip: [...SKIP],
  people,
  categories,
  events,
  nutrition_entries: [],
  training_entries: [],
  event_requests: [],
  food_memory: [],
};

writeFileSync('site/data/seed.json', `${JSON.stringify(seed, null, 2)}\n`);

function sqlString(value) {
  if (value == null) return 'null';
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(list) {
  return `array[${list.map(sqlString).join(', ')}]::text[]`;
}

function sqlBool(value) {
  return value ? 'true' : 'false';
}

const lines = [];
lines.push('-- Generated by scripts/generate-seed.mjs. Do not edit by hand.');
lines.push('-- Run after the schema migration. Safe to re-run.');
lines.push('begin;');
lines.push('');

for (const person of people) {
  lines.push(
    `insert into people (id, name, role, sort_order) values (${sqlString(person.id)}, ${sqlString(person.name)}, ${sqlString(person.role)}, ${person.sort_order}) on conflict (id) do update set name = excluded.name, role = excluded.role, sort_order = excluded.sort_order;`
  );
}
lines.push('');
for (const category of categories) {
  lines.push(
    `insert into categories (id, label, color, icon, sort_order, visible_to_kids) values (${sqlString(category.id)}, ${sqlString(category.label)}, ${sqlString(category.color)}, ${sqlString(category.icon)}, ${category.sort_order}, ${sqlBool(category.visible_to_kids)}) on conflict (id) do update set label = excluded.label, color = excluded.color, icon = excluded.icon, sort_order = excluded.sort_order, visible_to_kids = excluded.visible_to_kids;`
  );
}
lines.push('');
lines.push(`delete from events where source = 'seed';`);
for (const row of events) {
  lines.push(
    `insert into events (id, title, starts_at, ends_at, all_day, multi_day, location, people, category_id, status, source, notes) values (${sqlString(row.id)}, ${sqlString(row.title)}, ${sqlString(row.starts_at)}, ${sqlString(row.ends_at)}, ${sqlBool(row.all_day)}, ${sqlBool(row.multi_day)}, ${sqlString(row.location)}, ${sqlArray(row.people)}, ${sqlString(row.category_id)}, ${sqlString(row.status)}, ${sqlString(row.source)}, ${sqlString(row.notes)});`
  );
}
lines.push('');
lines.push('commit;');
lines.push('');
writeFileSync('supabase/seed.sql', lines.join('\n'));

const byCat = Object.groupBy(events, (row) => row.category_id);
console.log(`events: ${events.length}`);
for (const [key, rows] of Object.entries(byCat)) console.log(`  ${key}: ${rows.length}`);
console.log('first', events[0].id, events[0].starts_at);
console.log('last', events.at(-1).id, events.at(-1).starts_at);
