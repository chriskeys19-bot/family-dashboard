import { checkoffControl } from '../checkoff.js';
import { cricketRecap } from '../reflection.js';
import { el } from '../dom.js';
import { registerModule } from '../registry.js';
import { buildRecap, mealLine, sessionLine } from '../recap.js';
import { formatISODate, formatISOWeekday } from '../time.js';

function subjects(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile];
  if (ctx.focusPersonId) return ctx.people.filter((person) => person.id === ctx.focusPersonId);
  return ctx.people.filter((person) => person.role === 'kid');
}

function categoryLabel(ctx, categoryId) {
  return ctx.categories.find((category) => category.id === categoryId)?.label || categoryId;
}

function groupEvents(ctx, events) {
  const groups = new Map();
  for (const event of events) {
    const label = categoryLabel(ctx, event.category_id);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(event);
  }
  return groups;
}

function eventList(ctx, person, events, yesterday) {
  const wrap = el('div', { class: 'recap-groups' });
  for (const [label, rows] of groupEvents(ctx, events)) {
    const block = el('div', { class: 'recap-group' });
    block.append(el('p', { class: 'recap-cat' }, label));
    for (const event of rows) {
      block.append(el('div', { class: 'recap-item' },
        el('p', { class: 'recap-title' }, event.title),
        checkoffControl(ctx, {
          personId: person.id,
          itemType: 'event',
          itemId: event.id,
          occurrenceOn: yesterday,
          categoryId: event.category_id,
          label: event.title,
        })));
    }
    wrap.append(block);
  }
  return wrap;
}

registerModule({
  id: 'recap',
  label: 'Yesterday recap',
  dataTable: 'completions',
  placement: 'day',
  sortOrder: 1,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    const today = formatISODate(ctx.now);
    for (const person of subjects(ctx)) {
      const recap = buildRecap({
        person,
        events: ctx.events,
        nutrition: ctx.nutrition,
        training: ctx.training,
        completions: ctx.completions,
        todayISO: today,
      });
      const card = el('article', {
        class: 'card recap-card',
        'data-testid': `recap-${person.id}`,
      });
      card.append(el('p', { class: 'log-kicker' }, `${person.name} · ${formatISOWeekday(recap.yesterday)}`));
      card.append(el('p', { class: 'recap-counts', 'data-testid': `recap-counts-${person.id}` }, `Done ${recap.doneCount} · Missed ${recap.missedCount}`));
      if (recap.doneEvents.length || recap.meals.length || recap.sessions.length) {
        card.append(el('h3', { class: 'recap-heading' }, 'Done'));
        if (recap.doneEvents.length) card.append(eventList(ctx, person, recap.doneEvents, recap.yesterday));
        if (recap.meals.length) {
          const meals = el('div', { class: 'recap-group', 'data-testid': `recap-meals-${person.id}` });
          meals.append(el('p', { class: 'recap-cat' }, 'Meals'));
          for (const meal of recap.meals) meals.append(el('p', {}, mealLine(meal)));
          if (recap.protein != null) meals.append(el('p', { class: 'log-meta' }, `About ${recap.protein} g protein · estimate`));
          card.append(meals);
        }
        if (recap.sessions.length) {
          const sessions = el('div', { class: 'recap-group', 'data-testid': `recap-training-${person.id}` });
          sessions.append(el('p', { class: 'recap-cat' }, 'Training'));
          for (const session of recap.sessions) sessions.append(el('p', {}, sessionLine(session)));
          card.append(sessions);
        }
      }
      if (recap.missedEvents.length) {
        card.append(el('h3', { class: 'recap-heading' }, 'Missed'));
        card.append(eventList(ctx, person, recap.missedEvents, recap.yesterday));
      } else if (!recap.doneCount) {
        card.append(el('p', { class: 'empty' }, 'Nothing was scheduled yesterday.'));
      }
      const cricket = cricketRecap(ctx.reflections, person.id, recap.yesterday);
      if (cricket) {
        const block = el('div', { 'data-testid': `recap-cricket-${person.id}` });
        block.append(el('h3', { class: 'recap-heading' }, 'Cricket'));
        if (cricket.themes.length) block.append(el('p', {}, `Focused on ${cricket.themes.join(' and ')}.`));
        if (cricket.feel || cricket.trend) block.append(el('p', {}, [cricket.feel, cricket.trend].filter(Boolean).join(' · ')));
        for (const line of cricket.learned) block.append(el('p', { class: 'event-notes' }, line));
        card.append(block);
      }
      const ideas = el('div', { 'data-testid': `recap-suggestions-${person.id}` });
      ideas.append(el('h3', { class: 'recap-heading' }, 'A nudge'));
      for (const line of recap.suggestions) ideas.append(el('p', { class: 'recap-suggestion' }, line));
      card.append(ideas);
      host.append(card);
    }
  },
});
