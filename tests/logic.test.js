import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { boostForPerson, dayNumberFromISO } from '../site/js/boost.js';
import { sumPhotoItems } from '../site/js/photo-meal.js';
import { assembleJournal } from '../site/js/journal.js';
import { buildRecap } from '../site/js/recap.js';
import { eventTouchesDay, formatRangeLabel, getRange, zonedWallTime } from '../site/js/time.js';

const seed = JSON.parse(readFileSync('site/data/seed.json', 'utf8'));
const boost = JSON.parse(readFileSync('site/data/boost.json', 'utf8'));
const now = new Date('2026-10-30T17:00:00Z');

test('three-day window is Oct 30 through Nov 1 Pacific', () => {
  const range = getRange('3d', now);
  assert.equal(range.start.toISOString(), '2026-10-30T07:00:00.000Z');
  assert.equal(range.end.toISOString(), '2026-11-02T08:00:00.000Z');
  assert.equal(formatRangeLabel(range), 'Oct 30 – Nov 1');
});

test('week and month windows stay on the Pacific calendar', () => {
  assert.equal(formatRangeLabel(getRange('1w', now)), 'Oct 30 – Nov 5');
  assert.equal(formatRangeLabel(getRange('1m', now)), 'Oct 30 – Nov 29');
});

test('seed clocks match Pacific wall time, including the Nov 1 fallback', () => {
  assert.equal(zonedWallTime(2026, 11, 1, 7, 45).toISOString(), '2026-11-01T15:45:00.000Z');
  for (const event of seed.events) {
    for (const stamp of [event.starts_at, event.ends_at]) {
      const match = stamp.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      const wall = zonedWallTime(+match[1], +match[2], +match[3], +match[4], +match[5]);
      assert.equal(wall.toISOString(), new Date(stamp).toISOString(), event.id);
    }
  }
});

test('seed skips Houston dates for practice, gym, and class', () => {
  const skip = new Set(seed.houston_skip);
  for (const event of seed.events) {
    if (!['cricket-practice', 'gym', 'academics'].includes(event.category_id)) continue;
    const day = event.starts_at.slice(0, 10);
    assert.equal(skip.has(day), false, event.id);
  }
  assert.equal(seed.events.filter((event) => event.category_id === 'tournament').length, 4);
  assert.equal(seed.events.filter((event) => event.notes === 'Details TBD.').length, 6);
  assert.ok(seed.events.some((event) => event.id === 'practice-cheetahs-2026-11-25'));
});

test('Nov 1 games overlap and Friday gym overlaps Blazers', () => {
  const nov1 = seed.events.filter((event) => event.starts_at.startsWith('2026-11-01'));
  const varun = nov1.filter((event) => event.people.includes('varun'));
  assert.equal(varun.length, 3);
  const friday = seed.events.filter((event) => event.id.endsWith('2026-10-30') && ['gym', 'cricket-practice'].includes(event.category_id));
  assert.equal(friday.length, 2);
  assert.equal(eventTouchesDay(friday[0].starts_at, friday[0].ends_at, '2026-10-30'), true);
});

test('daily picks do not repeat until the bank is used, and kids differ', () => {
  for (const [name, rows] of Object.entries(boost.lists)) {
    assert.ok(rows.length >= 120, name);
  }
  const yuvan = { id: 'yuvan', role: 'kid' };
  const varun = { id: 'varun', role: 'kid' };
  const seen = new Set();
  for (let i = 0; i < boost.lists.kid_quotes.length; i += 1) {
    const iso = dayToISO(i);
    const pick = boostForPerson(boost.lists, yuvan, iso).quote.text;
    assert.equal(seen.has(pick), false);
    seen.add(pick);
    assert.notEqual(pick, boostForPerson(boost.lists, varun, iso).quote.text);
    assert.notEqual(
      boostForPerson(boost.lists, yuvan, iso).joke.text,
      boostForPerson(boost.lists, varun, iso).joke.text,
    );
  }
});

test('yesterday recap suggests meals and practice without piling on', () => {
  const person = { id: 'yuvan', role: 'kid' };
  const practice = {
    id: 'practice-1',
    people: ['yuvan'],
    status: 'confirmed',
    category_id: 'cricket-practice',
    title: 'Blazers',
    starts_at: '2026-10-30T18:00:00-07:00',
    ends_at: '2026-10-30T21:15:00-07:00',
  };
  const empty = buildRecap({
    person, events: [], nutrition: [], training: [], completions: [], todayISO: '2026-10-30',
  });
  assert.match(empty.suggestions.join(' '), /No meals/);
  assert.equal(empty.suggestions.length <= 2, true);
  const missed = buildRecap({
    person, events: [practice], nutrition: [], training: [], completions: [], todayISO: '2026-10-31',
  });
  assert.equal(missed.missedEvents.length, 1);
  assert.match(missed.suggestions[0], /Practice/);
  const done = buildRecap({
    person,
    events: [practice],
    nutrition: [{ person_id: 'yuvan', eaten_at: '2026-10-30T16:00:00-07:00', source: 'fdc', protein_g: 50, calories: 400 }],
    training: [{ person_id: 'yuvan', trained_on: '2026-10-30', session_type: 'easy' }],
    completions: [{ person_id: 'yuvan', item_type: 'event', item_id: 'practice-1', occurrence_on: '2026-10-30', completed_at: '2026-10-30T22:00:00Z' }],
    todayISO: '2026-10-31',
  });
  assert.equal(done.missedCount, 0);
  assert.match(done.suggestions[0], /solid day/);
});

test('photo item edits recompute the estimate', () => {
  const totals = sumPhotoItems([
    { calories: 250, protein_g: 4, carbs_g: 45, fat_g: 0.4 },
    { calories: 180, protein_g: 9, carbs_g: 22, fat_g: 6 },
  ]);
  assert.equal(totals.calories, 430);
  assert.equal(dayNumberFromISO('2026-01-01'), 0);
});

test('journal export packs one Pacific day including the recap', () => {
  const person = { id: 'yuvan', name: 'Yuvan', role: 'kid' };
  const journal = assembleJournal({
    person,
    date: '2026-10-30',
    events: [],
    completions: [
      { person_id: 'yuvan', item_type: 'event', item_id: 'a', occurrence_on: '2026-10-30', completed_at: '2026-10-31T03:00:00Z' },
      { person_id: 'yuvan', item_type: 'event', item_id: 'b', occurrence_on: '2026-10-31', completed_at: '2026-10-31T18:00:00Z' },
    ],
    reflections: [{ person_id: 'yuvan', event_id: 'a', occurrence_on: '2026-10-30', kind: 'practice', focus: ['batting'], feel: 5, duration_minutes: 90 }],
    training: [{ person_id: 'yuvan', trained_on: '2026-10-30', session_type: 'easy', feel: 4 }],
    nutrition: [{ person_id: 'yuvan', eaten_at: '2026-10-30T18:00:00-07:00', source: 'fdc', calories: 400, protein_g: 20, carbs_g: 40, fat_g: 10 }],
    notes: [{ person_id: 'yuvan', body: 'hello', created_at: '2026-10-30T20:00:00-07:00' }],
    needs: [{ person_id: 'yuvan', item: 'grips', created_at: '2026-10-30T20:00:00-07:00', updated_at: '2026-10-30T20:00:00-07:00' }],
  });
  assert.equal(journal.completions.length, 1);
  assert.equal(journal.reflections.length, 1);
  assert.deepEqual(journal.practice_mentions, ['Practiced 1.5 hr.']);
  assert.equal(journal.runs.length, 1);
  assert.equal(journal.meals.length, 1);
  assert.equal(journal.meal_totals.calories, 400);
  assert.equal(journal.notes[0].body, 'hello');
  assert.equal(journal.needs[0].item, 'grips');
  assert.equal(journal.recap.yesterday, '2026-10-30');
  assert.equal(journal.timezone, 'America/Los_Angeles');
});

test('the public site folder has no family photos', () => {
  const banned = [];
  walk('site', (file) => {
    if (/\.(jpe?g|png|webp|gif|heic)$/i.test(file) || /rushmore|family-banner/i.test(file)) banned.push(file);
  });
  assert.deepEqual(banned, []);
  const css = readFileSync('site/css/app.css', 'utf8');
  assert.match(css, /aspect-ratio:\s*3\s*\/\s*4/);
  assert.match(css, /max-height:\s*70vh/);
  assert.match(css, /object-position:\s*center top/);
});

function dayToISO(dayNumber) {
  const dt = new Date(Date.UTC(2026, 0, 1 + dayNumber));
  return dt.toISOString().slice(0, 10);
}

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, visit);
    else visit(path);
  }
}
