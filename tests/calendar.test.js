import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  buildMonthGrid,
  calendarItems,
  dayDots,
  eventTimeLabel,
  eventsOnDay,
  kidNames,
  legendCategories,
  monthTitle,
  shiftMonth,
} from '../site/js/calendar.js';

const seed = JSON.parse(readFileSync('site/data/seed.json', 'utf8'));
const yuvan = seed.people.find((person) => person.id === 'yuvan');
const varun = seed.people.find((person) => person.id === 'varun');
const ben = seed.people.find((person) => person.id === 'ben');

function itemsFor(profile, focusPersonId = null) {
  return calendarItems({
    events: seed.events,
    requests: [],
    categories: seed.categories,
    profile,
    focusPersonId,
  });
}

test('November 2026 is a Monday-first grid with faded neighbor days', () => {
  assert.equal(monthTitle(2026, 11), 'November 2026');
  const cells = buildMonthGrid(2026, 11);
  assert.equal(cells.length, 42);
  assert.deepEqual(cells.slice(0, 7).map((cell) => cell.iso), [
    '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01',
  ]);
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells.find((cell) => cell.iso === '2026-11-01').inMonth, true);
  assert.equal(cells.at(-1).iso, '2026-12-06');
  assert.equal(cells.at(-1).inMonth, false);
  assert.equal(buildMonthGrid(2026, 10)[0].iso, '2026-09-28');
});

test('month arrows cross the year boundary', () => {
  assert.deepEqual(shiftMonth(2026, 11, -1), { y: 2026, m: 10 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { y: 2027, m: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { y: 2025, m: 12 });
});

test('a day gets one dot per category, with kid markers only for the family view', () => {
  const family = itemsFor(ben);
  const nov7 = eventsOnDay(family, '2026-11-07');
  const titles = nov7.map((item) => item.title);
  assert.ok(titles.includes('Cheetahs Beta vs Strikers Blue 2'));
  assert.ok(titles.includes('Cric Kingdom'));
  assert.deepEqual(dayDots(nov7, { categories: seed.categories, people: seed.people, markKids: true }).map((dot) => ({
    categoryId: dot.categoryId,
    kids: dot.kids,
  })), [
    { categoryId: 'cricket-games', kids: ['varun'] },
    { categoryId: 'cricket-practice', kids: ['yuvan', 'varun'] },
  ]);

  const yuvanDots = dayDots(eventsOnDay(itemsFor(yuvan), '2026-11-07'), {
    categories: seed.categories,
    people: seed.people,
    markKids: false,
  });
  assert.deepEqual(yuvanDots.map((dot) => dot.categoryId), ['cricket-practice']);
  assert.deepEqual(yuvanDots[0].kids, []);

  const nov5 = eventsOnDay(family, '2026-11-05');
  assert.ok(nov5.some((item) => item.title === 'RSM class' && item.people.includes('yuvan') && !item.people.includes('varun')));
  assert.equal(eventsOnDay(itemsFor(ben, 'varun'), '2026-11-05').some((item) => item.title === 'RSM class'), false);
  assert.equal(eventsOnDay(itemsFor(varun), '2026-11-05').some((item) => item.title === 'RSM class'), false);
});

test('multi-day tournaments fill each day, and an all-day game does not spill over', () => {
  const family = itemsFor(ben);
  for (const iso of ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24']) {
    const rows = eventsOnDay(family, iso);
    assert.equal(rows.filter((item) => item.category_id === 'tournament').length, 2, iso);
    assert.equal(eventTimeLabel(rows.find((item) => item.multi_day)), '6:00 AM – 3:00 PM · Daily');
  }
  assert.equal(eventsOnDay(family, '2026-11-25').some((item) => item.category_id === 'tournament'), false);
  const allDay = eventsOnDay(family, '2026-12-05').find((item) => item.all_day);
  assert.equal(allDay.people.includes('yuvan'), true);
  assert.equal(eventTimeLabel(allDay), 'All day');
  assert.equal(eventsOnDay(family, '2026-12-06').some((item) => item.id === allDay.id), false);
  const both = eventsOnDay(family, '2026-11-07').find((item) => item.title === 'Cric Kingdom');
  assert.deepEqual(kidNames(both, seed.people), ['Yuvan', 'Varun']);
});

test('kids do not see a category hidden from them, and requests join the day', () => {
  const hidden = seed.categories.map((category) => (
    category.id === 'academics' ? { ...category, visible_to_kids: false } : category
  ));
  const kidItems = calendarItems({
    events: seed.events,
    requests: [],
    categories: hidden,
    profile: yuvan,
    focusPersonId: 'yuvan',
  });
  assert.equal(kidItems.some((item) => item.category_id === 'academics'), false);
  const parentItems = calendarItems({
    events: seed.events,
    requests: [],
    categories: hidden,
    profile: ben,
    focusPersonId: null,
  });
  assert.equal(parentItems.some((item) => item.category_id === 'academics'), true);

  const request = {
    id: 'req-1',
    person_id: 'yuvan',
    title: 'Movie with friends',
    starts_at: '2026-10-31T14:00:00-07:00',
    ends_at: '2026-10-31T16:00:00-07:00',
    location: 'AMC NewPark',
    category_id: 'social',
    status: 'requested',
  };
  const withRequest = calendarItems({
    events: [],
    requests: [request],
    categories: seed.categories,
    profile: ben,
    focusPersonId: null,
  });
  assert.equal(eventsOnDay(withRequest, '2026-10-31')[0].title, 'Movie with friends');
  assert.equal(eventTimeLabel(withRequest[0]), '2:00 PM – 4:00 PM');
  assert.equal(eventsOnDay(calendarItems({
    events: [],
    requests: [request],
    categories: seed.categories,
    profile: varun,
    focusPersonId: 'varun',
  }), '2026-10-31').length, 0);
  assert.deepEqual(legendCategories(withRequest, seed.categories).map((category) => category.id), ['social']);
});

test('legend follows category order and skips unused types', () => {
  const labels = legendCategories(itemsFor(ben), seed.categories).map((category) => category.label);
  assert.deepEqual(labels, ['Cricket Games', 'Cricket Practice', 'Gym', 'Tournament', 'Academics']);
});
