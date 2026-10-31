import { el, field } from '../dom.js';
import { closeSheet, openSheet } from '../sheet.js';
import { saveWeight } from '../store.js';
import { formatISODate, formatISOWeekday } from '../time.js';
import { registerModule } from '../registry.js';
import { kgToLb, lbToKg, previousWeek, summarizeFamily, summarizeWeek, weekRange } from '../week.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso) {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  return `${formatISOWeekday(iso).slice(0, 3)} ${MONTHS[month - 1]} ${day}`;
}

function kidsInScope(ctx) {
  const kids = ctx.people.filter((person) => person.role === 'kid');
  if (ctx.profile.role === 'kid') return kids.filter((person) => person.id === ctx.profile.id);
  if (ctx.focusPersonId) return kids.filter((person) => person.id === ctx.focusPersonId);
  return kids;
}

function summaryFor(ctx, person, range) {
  return summarizeWeek({
    person,
    events: ctx.events,
    completions: ctx.completions,
    reflections: ctx.reflections,
    training: ctx.training,
    nutrition: ctx.nutrition,
    range,
  });
}

function compare(nowText, thenText) {
  return `${nowText} · last week ${thenText}`;
}

function counterCard(summary, last, { family = false } = {}) {
  const id = family ? 'family' : summary.person_id;
  return el('article', { class: 'card', 'data-testid': `week-${id}` },
    el('p', { class: 'log-kicker' }, family ? 'Both boys' : summary.name),
    el('p', { 'data-testid': `week-cricket-${id}` }, `Cricket ${compare(summary.cricket_label, last.cricket_label)}`),
    el('p', { 'data-testid': `week-run-${id}` }, `Run ${compare(`${summary.miles_run} mi`, `${last.miles_run} mi`)}`),
    el('p', { 'data-testid': `week-gym-${id}` }, `Gym ${summary.gym_sessions} ${summary.gym_sessions === 1 ? 'session' : 'sessions'} · ${summary.gym_label} · last week ${last.gym_sessions} ${last.gym_sessions === 1 ? 'session' : 'sessions'} · ${last.gym_label}`),
    el('p', { 'data-testid': `week-eaten-${id}` }, `Eaten ${compare(`~${summary.calories_eaten} kcal · ${summary.protein_g} g protein`, `~${last.calories_eaten} kcal · ${last.protein_g} g protein`)}`),
    el('p', { 'data-testid': `week-burned-${id}` }, `Burned ${compare(`~${summary.calories_burned} kcal`, `~${last.calories_burned} kcal`)} · approximate`),
    family ? null : el('p', { class: 'log-meta', 'data-testid': `week-weight-${id}` }, `Using ${summary.weight_lb} lb`));
}

function openWeights(ctx) {
  const kids = ctx.people.filter((person) => person.role === 'kid');
  openSheet({
    title: 'Body weight',
    render(body) {
      const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
      const inputs = new Map();
      const stack = el('div', { class: 'stack' });
      stack.append(el('p', { class: 'lede' }, 'Used to estimate calories burned. Approximate.'));
      for (const kid of kids) {
        const input = el('input', {
          type: 'text',
          inputmode: 'decimal',
          value: String(kgToLb(kid.weight_kg)),
          'data-testid': `weight-${kid.id}`,
          'aria-label': `${kid.name} weight in pounds`,
        });
        inputs.set(kid.id, input);
        stack.append(field(`${kid.name} (lb)`, input));
      }
      stack.append(error, el('button', {
        type: 'button',
        class: 'btn primary block',
        'data-testid': 'save-weights',
        onclick: async () => {
          error.hidden = true;
          try {
            for (const kid of kids) {
              const lb = Number(inputs.get(kid.id).value);
              if (!Number.isFinite(lb) || lb < 30 || lb > 250) {
                throw new Error('Enter a weight between 30 and 250 lb.');
              }
              await saveWeight(kid.id, lbToKg(lb));
            }
            closeSheet();
          } catch (err) {
            error.hidden = false;
            error.textContent = err.message || 'Could not save weights.';
          }
        },
      }, 'Save'));
      body.replaceChildren(stack);
    },
  });
}

registerModule({
  id: 'week',
  label: 'This week',
  dataTable: 'person_settings',
  placement: 'day',
  sortOrder: 0,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    const today = formatISODate(ctx.now);
    const range = weekRange(today);
    const prior = previousWeek(range);
    const kids = kidsInScope(ctx);
    host.append(el('p', { class: 'range-label', 'data-testid': 'week-span' }, `${shortDate(range.start)} – ${shortDate(range.end)}`));
    if (ctx.profile.role === 'parent' && !ctx.focusPersonId) {
      const boys = ctx.people.filter((person) => person.role === 'kid').map((person) => summaryFor(ctx, person, range));
      const lastBoys = ctx.people.filter((person) => person.role === 'kid').map((person) => summaryFor(ctx, person, prior));
      host.append(counterCard(summarizeFamily(boys), summarizeFamily(lastBoys), { family: true }));
    }
    for (const kid of kids) {
      host.append(counterCard(summaryFor(ctx, kid, range), summaryFor(ctx, kid, prior)));
    }
    if (ctx.profile.role === 'parent') {
      host.append(el('button', {
        type: 'button',
        class: 'btn ghost',
        'data-testid': 'edit-weights',
        onclick: () => openWeights(ctx),
      }, 'Weights'));
    }
  },
});
