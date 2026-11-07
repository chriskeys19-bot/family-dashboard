/**
 * Month-grid math for the calendar module.
 * Days are Pacific calendar dates. There is no school-day or holiday table,
 * so cells are not tinted by day type.
 */
import { eventTouchesDay, formatTime } from './time.js';

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const AVATAR = {
  ben: '#1c5c3b',
  sangeetha: '#7a4e8a',
  yuvan: '#b85a2a',
  varun: '#2a6f8f',
};
const FALLBACK = ['#1c5c3b', '#7a4e8a', '#b85a2a', '#2a6f8f', '#3d5a80', '#9b2335'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isoOf(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function monthTitle(y, m) {
  return `${MONTHS[m - 1]} ${y}`;
}

export function shiftMonth(y, m, delta) {
  const next = new Date(Date.UTC(y, m - 1 + delta, 1));
  return { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1 };
}

/** Monday-first grid, including faded days from the adjacent months. */
export function buildMonthGrid(y, m) {
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const lead = (firstDow + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  const start = new Date(Date.UTC(y, m - 1, 1 - lead));
  const cells = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const dt = new Date(start.getTime() + i * 86400000);
    const yy = dt.getUTCFullYear();
    const mm = dt.getUTCMonth() + 1;
    const dd = dt.getUTCDate();
    cells.push({
      iso: isoOf(yy, mm, dd),
      day: dd,
      inMonth: yy === y && mm === m,
    });
  }
  return cells;
}

export function personColor(people, id) {
  if (AVATAR[id]) return AVATAR[id];
  const index = people.findIndex((person) => person.id === id);
  return FALLBACK[(index < 0 ? 0 : index) % FALLBACK.length];
}

function personVisible(peopleIds, profile, focusPersonId) {
  if (profile?.role === 'kid') return peopleIds.includes(profile.id);
  if (focusPersonId) return peopleIds.includes(focusPersonId);
  return true;
}

function sortedKids(ids, people) {
  return ids
    .map((id) => people.find((person) => person.id === id))
    .filter((person) => person && person.role === 'kid')
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
}

/**
 * Events (and social requests, which the schedule already shows) the viewer
 * is allowed to see. Kid profiles only keep their own rows.
 */
export function calendarItems({ events = [], requests = [], categories = [], profile, focusPersonId }) {
  const hidden = new Set(
    categories
      .filter((category) => profile?.role === 'kid' && category.visible_to_kids === false)
      .map((category) => category.id),
  );
  const items = [];
  for (const event of events) {
    if (hidden.has(event.category_id)) continue;
    const people = event.people || [];
    if (!personVisible(people, profile, focusPersonId)) continue;
    items.push(event);
  }
  for (const row of requests) {
    const categoryId = row.category_id || 'social';
    if (hidden.has(categoryId)) continue;
    if (!personVisible([row.person_id], profile, focusPersonId)) continue;
    items.push({
      id: row.id,
      kind: 'request',
      title: row.title,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      all_day: false,
      multi_day: false,
      location: row.location || '',
      people: [row.person_id],
      category_id: categoryId,
      status: row.status || 'requested',
    });
  }
  return items;
}

export function eventsOnDay(items, isoDate) {
  return items
    .filter((item) => eventTouchesDay(item.starts_at, item.ends_at, isoDate))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at)
      || a.title.localeCompare(b.title)
      || String(a.id).localeCompare(String(b.id)));
}

export function legendCategories(items, categories) {
  const used = new Set(items.map((item) => item.category_id));
  return [...categories]
    .filter((category) => used.has(category.id))
    .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
}

/** One dot per category. `kids` is filled only when the family view marks who. */
export function dayDots(itemsOnDay, { categories, people, markKids }) {
  const byCategory = new Map();
  for (const item of itemsOnDay) {
    if (!byCategory.has(item.category_id)) byCategory.set(item.category_id, new Set());
    for (const kid of sortedKids(item.people || [], people)) byCategory.get(item.category_id).add(kid.id);
  }
  const dots = [];
  for (const category of legendCategories([...byCategory.keys()].map((id) => ({ category_id: id })), categories)) {
    const kids = [...byCategory.get(category.id)];
    dots.push({
      categoryId: category.id,
      label: category.label,
      color: category.color,
      kids: markKids ? sortedKids(kids, people).map((kid) => kid.id) : [],
    });
  }
  return dots;
}

export function kidsInItems(items, people) {
  const ids = new Set();
  for (const item of items) {
    for (const kid of sortedKids(item.people || [], people)) ids.add(kid.id);
  }
  return sortedKids([...ids], people);
}

export function eventTimeLabel(item) {
  if (item.all_day) return 'All day';
  const range = `${formatTime(item.starts_at)} – ${formatTime(item.ends_at)}`;
  return item.multi_day ? `${range} · Daily` : range;
}

export function kidNames(item, people) {
  return sortedKids(item.people || [], people).map((kid) => kid.name);
}
