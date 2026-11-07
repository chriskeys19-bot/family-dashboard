import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  calendarItems,
  dayDots,
  eventTimeLabel,
  eventsOnDay,
  kidNames,
  kidsInItems,
  legendCategories,
  monthTitle,
  personColor,
  shiftMonth,
} from '../calendar.js';
import { el, safeColor } from '../dom.js';
import { STATUS_LABELS } from '../labels.js';
import { registerModule } from '../registry.js';
import { dayBounds, formatISODate, formatLongDate, zonedYMD } from '../time.js';

let monthCursor = null;
let selectedISO = null;

function ensureCursor(now) {
  if (monthCursor) return;
  const { y, m } = zonedYMD(now);
  monthCursor = { y, m };
  selectedISO = formatISODate(now);
}

function chevron(direction) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'cal-chevron');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', direction === 'left' ? 'M14 6l-6 6 6 6' : 'M10 6l6 6-6 6');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.8');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  svg.append(path);
  return svg;
}

function markKids(ctx) {
  return ctx.profile?.role === 'parent' && !ctx.focusPersonId;
}

function dayLabel(iso, dots, people, showKids) {
  const when = formatLongDate(dayBounds(iso).start);
  if (!dots.length) return `${when}, nothing scheduled`;
  const parts = dots.map((dot) => {
    if (!showKids || !dot.kids.length) return dot.label;
    const names = dot.kids.map((id) => people.find((person) => person.id === id)?.name || id);
    const who = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
    return `${dot.label} for ${who}`;
  });
  return `${when}, ${parts.join(', ')}`;
}

function detailCard(ctx, items) {
  const card = el('article', {
    class: 'card cal-detail',
    'data-testid': 'calendar-detail',
    'aria-live': 'polite',
  });
  if (!selectedISO) {
    card.append(el('p', { class: 'empty' }, 'Tap a day to see what’s on it.'));
    return card;
  }
  const rows = eventsOnDay(items, selectedISO);
  card.append(el('p', { class: 'cal-kicker', 'data-testid': 'calendar-detail-date' }, formatLongDate(dayBounds(selectedISO).start)));
  if (!rows.length) {
    card.append(el('p', { class: 'empty' }, 'Nothing scheduled this day.'));
    return card;
  }
  const list = el('div', { class: 'cal-events' });
  const showKids = markKids(ctx);
  for (const item of rows) {
    const category = ctx.categories.find((row) => row.id === item.category_id);
    const chip = el('span', { class: 'cal-chip' },
      el('i', { class: 'cal-dot', style: `background:${safeColor(category?.color)}`, 'aria-hidden': 'true' }),
      category?.label || item.category_id);
    const status = item.status && item.status !== 'confirmed'
      ? el('span', { class: 'cal-status' }, STATUS_LABELS[item.status] || item.status)
      : null;
    const names = showKids ? kidNames(item, ctx.people) : [];
    list.append(el('div', {
      class: 'cal-event',
      'data-testid': `calendar-event-${item.id}`,
    },
    el('p', { class: 'cal-event-time' }, eventTimeLabel(item)),
    el('p', { class: 'cal-event-title' }, item.title),
    item.location ? el('p', { class: 'cal-event-where' }, item.location) : null,
    el('div', { class: 'cal-chip-row' }, chip, status),
    names.length ? el('p', { class: 'cal-event-who' }, names.join(' · ')) : null));
  }
  card.append(list);
  return card;
}

function draw(ctx, host, restore) {
  const { y, m } = monthCursor;
  const showKids = markKids(ctx);
  const items = calendarItems({
    events: ctx.events,
    requests: ctx.requests,
    categories: ctx.categories,
    profile: ctx.profile,
    focusPersonId: ctx.focusPersonId,
  });
  const cells = buildMonthGrid(y, m);
  if (selectedISO && !cells.some((cell) => cell.iso === selectedISO)) selectedISO = null;
  const today = formatISODate(ctx.now);
  const title = monthTitle(y, m);

  const legend = el('ul', { class: 'cal-legend', 'data-testid': 'calendar-legend' });
  for (const category of legendCategories(items, ctx.categories)) {
    legend.append(el('li', {},
      el('i', { class: 'cal-dot', style: `background:${safeColor(category.color)}`, 'aria-hidden': 'true' }),
      category.label));
  }

  let kidLegend = null;
  if (showKids) {
    const kids = kidsInItems(items, ctx.people);
    if (kids.length) {
      kidLegend = el('div', { class: 'cal-who' });
      kidLegend.append(el('p', { class: 'cal-who-label' }, 'Who'));
      const list = el('ul', { class: 'cal-legend', 'data-testid': 'calendar-kid-legend' });
      for (const kid of kids) {
        list.append(el('li', {},
          el('i', { class: 'cal-tick', style: `background:${personColor(ctx.people, kid.id)}`, 'aria-hidden': 'true' }),
          kid.name));
      }
      kidLegend.append(list);
    }
  }

  const grid = el('div', {
    class: 'cal-grid',
    role: 'grid',
    'aria-label': title,
    'data-testid': 'calendar-grid',
  });
  for (const label of WEEKDAY_LABELS) {
    grid.append(el('div', { class: 'cal-dow', role: 'columnheader' }, label));
  }
  for (const cell of cells) {
    const dots = dayDots(eventsOnDay(items, cell.iso), {
      categories: ctx.categories,
      people: ctx.people,
      markKids: showKids,
    });
    const dotRow = el('span', { class: 'cal-dots', 'aria-hidden': 'true' });
    for (const dot of dots) {
      const marks = el('span', { class: 'cal-kidmarks' });
      for (const kidId of dot.kids) {
        marks.append(el('i', { style: `background:${personColor(ctx.people, kidId)}` }));
      }
      dotRow.append(el('span', {
        class: 'cal-dot-wrap',
        'data-category': dot.categoryId,
        'data-kids': dot.kids.length ? dot.kids.join(',') : null,
      },
      el('i', { class: 'cal-dot', style: `background:${safeColor(dot.color)}` }),
      dot.kids.length ? marks : null));
    }
    const classes = ['cal-day'];
    if (!cell.inMonth) classes.push('is-outside');
    if (cell.iso === today) classes.push('is-today');
    if (cell.iso === selectedISO) classes.push('is-selected');
    grid.append(el('button', {
      type: 'button',
      class: classes.join(' '),
      role: 'gridcell',
      'aria-pressed': cell.iso === selectedISO ? 'true' : 'false',
      'aria-current': cell.iso === today ? 'date' : null,
      'aria-label': dayLabel(cell.iso, dots, ctx.people, showKids),
      'data-testid': `calendar-day-${cell.iso}`,
      onclick: () => {
        selectedISO = cell.iso;
        draw(ctx, host, `calendar-day-${cell.iso}`);
      },
    },
    el('span', { class: 'cal-num' }, String(cell.day)),
    dotRow));
  }

  const nav = el('div', { class: 'cal-nav' },
    el('button', {
      type: 'button',
      class: 'cal-nav-btn',
      'aria-label': 'Previous month',
      'data-testid': 'calendar-prev',
      onclick: () => {
        monthCursor = shiftMonth(y, m, -1);
        draw(ctx, host, 'calendar-prev');
      },
    }, chevron('left')),
    el('h3', { class: 'cal-title', 'data-testid': 'calendar-title' }, title),
    el('button', {
      type: 'button',
      class: 'cal-nav-btn',
      'aria-label': 'Next month',
      'data-testid': 'calendar-next',
      onclick: () => {
        monthCursor = shiftMonth(y, m, 1);
        draw(ctx, host, 'calendar-next');
      },
    }, chevron('right')));

  host.replaceChildren(el('div', { class: 'cal', 'data-testid': 'calendar' },
    nav,
    legend,
    kidLegend,
    grid), detailCard(ctx, items));

  if (restore) {
    host.querySelector(`[data-testid="${restore}"]`)?.focus();
    if (String(restore).startsWith('calendar-day-')) {
      host.querySelector('[data-testid="calendar-detail"]')?.scrollIntoView({ block: 'nearest' });
    }
  }
}

registerModule({
  id: 'calendar',
  label: 'Calendar',
  dataTable: 'events',
  placement: 'day',
  sortOrder: 0.4,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    ensureCursor(ctx.now);
    draw(ctx, host);
  },
});
