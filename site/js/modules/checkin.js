import { el, field } from '../dom.js';
import { kgToLb, lbToKg } from '../week.js';
import {
  feetInchesToCm,
  formatHeight,
  formatMeasuredOn,
  hasMeasurementThisMonth,
  latestMeasurement,
} from '../measure.js';
import { registerModule } from '../registry.js';
import { saveMeasurement } from '../store.js';
import { formatISODate } from '../time.js';

const DISMISS_KEY = 'homeboard.checkin-dismiss.v1';

function dismissMap() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function dismissed(viewerId, personId, iso) {
  return Boolean(dismissMap()[`${viewerId}.${personId}.${iso}`]);
}

function rememberDismiss(viewerId, personId, iso) {
  const map = dismissMap();
  map[`${viewerId}.${personId}.${iso}`] = true;
  localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
}

function promptKids(ctx) {
  if (ctx.measurementsAvailable === false) return [];
  if (ctx.profile.role === 'kid') return [ctx.profile];
  if (!ctx.focusPersonId) return [];
  return ctx.people.filter((person) => person.role === 'kid' && person.id === ctx.focusPersonId);
}

function parentKids(ctx) {
  if (ctx.profile.role !== 'parent' || ctx.measurementsAvailable === false) return [];
  const kids = ctx.people.filter((person) => person.role === 'kid');
  if (ctx.focusPersonId) return kids.filter((person) => person.id === ctx.focusPersonId);
  return kids;
}

function latestLine(person, row) {
  const text = `${person.name} · ${formatHeight(row.height_cm)} · ${kgToLb(row.weight_kg)} lb · ${formatMeasuredOn(row.measured_on)}`;
  return el('article', {
    class: 'card checkin-latest',
    'data-testid': `measure-${person.id}`,
  },
  el('p', { class: 'log-kicker' }, 'Latest check-in'),
  el('p', {}, text),
  row.note ? el('p', { class: 'log-meta' }, row.note) : null);
}

function emptyLine(person) {
  return el('article', {
    class: 'card checkin-latest',
    'data-testid': `measure-${person.id}`,
  },
  el('p', { class: 'log-kicker' }, person.name),
  el('p', {}, 'No check-in yet.'));
}

function checkinForm(ctx, person, today) {
  const feet = el('input', {
    type: 'text',
    inputmode: 'numeric',
    maxlength: '1',
    autocomplete: 'off',
    'data-testid': `checkin-feet-${person.id}`,
  });
  const inches = el('input', {
    type: 'text',
    inputmode: 'decimal',
    maxlength: '4',
    autocomplete: 'off',
    'data-testid': `checkin-inches-${person.id}`,
  });
  const pounds = el('input', {
    type: 'text',
    inputmode: 'decimal',
    maxlength: '5',
    autocomplete: 'off',
    'data-testid': `checkin-pounds-${person.id}`,
  });
  const note = el('input', {
    type: 'text',
    maxlength: '200',
    autocomplete: 'off',
    'data-testid': `checkin-note-${person.id}`,
  });
  const error = el('p', {
    class: 'form-error',
    role: 'alert',
    'data-testid': `checkin-error-${person.id}`,
    hidden: true,
  });
  const save = el('button', {
    type: 'submit',
    class: 'btn primary',
    'data-testid': `checkin-save-${person.id}`,
  }, 'Save check-in');
  let saving = false;
  const form = el('form', {
    class: 'stack',
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      const ft = Number(feet.value);
      const inch = Number(inches.value);
      const lb = Number(pounds.value);
      if (!Number.isInteger(ft) || ft < 3 || ft > 7 || !Number.isFinite(inch) || inch < 0 || inch >= 12) {
        error.hidden = false;
        error.textContent = 'Enter feet from 3 to 7 and inches from 0 up to 12.';
        return;
      }
      if (!Number.isFinite(lb) || lb < 40 || lb > 300) {
        error.hidden = false;
        error.textContent = 'Enter pounds between 40 and 300.';
        return;
      }
      const heightCm = feetInchesToCm(ft, inch);
      const weightKg = lbToKg(lb);
      if (!heightCm || !weightKg) {
        error.hidden = false;
        error.textContent = 'Those numbers didn’t read. Try again.';
        return;
      }
      if (saving) return;
      saving = true;
      save.disabled = true;
      try {
        await saveMeasurement({
          person_id: person.id,
          measured_on: today,
          height_cm: heightCm,
          weight_kg: weightKg,
          note: note.value,
        });
      } catch (err) {
        saving = false;
        save.disabled = false;
        error.hidden = false;
        error.textContent = err.code === 'missing_table'
          ? 'The check-in isn’t available yet.'
          : (err.message || 'Could not save that check-in.');
      }
    },
  });
  form.append(
    el('div', { class: 'checkin-grid' },
      field('Feet', feet),
      field('Inches', inches),
      field('Pounds', pounds)),
    field('Reminder', note),
    error,
    el('div', { class: 'choice-row' },
      el('button', {
        type: 'button',
        class: 'btn ghost',
        'data-testid': `checkin-dismiss-${person.id}`,
        'aria-label': 'Dismiss monthly check-in',
        onclick: () => {
          rememberDismiss(ctx.profile.id, person.id, today);
          const card = form.closest('[data-testid^="checkin-card-"]');
          const host = card?.parentElement;
          card?.remove();
          const section = host?.closest('[data-module="checkin"]');
          if (host && !host.childElementCount) section?.remove();
        },
      }, 'Not now'),
      save),
  );
  return el('article', {
    class: 'card checkin-card',
    'data-testid': `checkin-card-${person.id}`,
  },
  el('h3', { class: 'checkin-title' }, 'Monthly check-in: enter your height and weight'),
  el('p', { class: 'lede' }, 'Once a month is enough. It helps the fuel note keep up with how you’re growing.'),
  form);
}

registerModule({
  id: 'checkin',
  label: 'Monthly check-in',
  dataTable: 'body_measurements',
  placement: 'day',
  sortOrder: -0.5,
  chrome: false,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    const today = formatISODate(ctx.now);
    const prompting = new Set(promptKids(ctx).map((person) => person.id));
    if (ctx.profile.role === 'parent') {
      for (const person of parentKids(ctx)) {
        const latest = latestMeasurement(ctx.measurements, person.id);
        if (latest) host.append(latestLine(person, latest));
        else if (!prompting.has(person.id)) host.append(emptyLine(person));
      }
    }
    for (const person of promptKids(ctx)) {
      if (hasMeasurementThisMonth(ctx.measurements, person.id, today)) continue;
      if (dismissed(ctx.profile.id, person.id, today)) continue;
      host.append(checkinForm(ctx, person, today));
    }
  },
});
