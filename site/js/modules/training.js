import { checkoffStack } from '../checkoff.js';
import { el, field } from '../dom.js';
import { feelPhrase, feelPicker, formatPace } from '../feel.js';
import { chooseKid } from '../kids.js';
import { SESSION_LABELS } from '../labels.js';
import { registerModule } from '../registry.js';
import { closeSheet, openSheet } from '../sheet.js';
import { addTraining } from '../store.js';
import { formatISODate, formatWeekday, ymdInRange } from '../time.js';

const TYPES = ['intervals', 'tempo', 'easy', 'race'];

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDistance(row) {
  const unit = row.distance_unit === 'mi' ? 'mi' : 'm';
  const value = row.distance_input ?? (unit === 'mi' ? Number(row.distance_m) / 1609.344 : row.distance_m);
  const rounded = unit === 'mi' ? Math.round(Number(value) * 100) / 100 : Math.round(Number(value));
  return `${rounded} ${unit}`;
}

function peopleInScope(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile.id];
  if (ctx.focusPersonId) return [ctx.focusPersonId];
  return ctx.people.filter((person) => person.role === 'kid').map((person) => person.id);
}

function openTrainingForm(ctx, kid) {
  openSheet({
    title: 'Log my run',
    render(body) {
      const today = formatISODate(ctx.now);
      let sessionType = '';
      let unit = 'm';
      let feel = null;
      const date = el('input', { type: 'date', value: today });
      const distance = el('input', {
        type: 'text',
        inputmode: 'decimal',
        autocomplete: 'off',
        placeholder: '800',
      });
      const minutes = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '2', maxlength: '3' });
      const seconds = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'off', placeholder: '45', maxlength: '2' });
      const note = el('textarea', { rows: '3', maxlength: '400' });
      const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
      const pace = el('p', { class: 'run-pace', 'data-testid': 'run-pace' }, 'Pace shows up once distance and time are in.');
      const types = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'What kind of run?' });
      const units = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'Distance unit' });
      const feelHost = el('div', { 'data-testid': 'feel-host' });

      const paintTypes = () => {
        types.replaceChildren();
        for (const type of TYPES) {
          types.append(el('button', {
            type: 'button',
            class: `btn choice${sessionType === type ? ' is-on' : ''}`,
            'aria-pressed': sessionType === type ? 'true' : 'false',
            'data-session-type': type,
            onclick: () => {
              sessionType = type;
              paintTypes();
            },
          }, SESSION_LABELS[type]));
        }
      };
      const paintUnits = () => {
        units.replaceChildren();
        for (const [id, label] of [['m', 'Meters'], ['mi', 'Miles']]) {
          units.append(el('button', {
            type: 'button',
            class: `btn choice${unit === id ? ' is-on' : ''}`,
            'aria-pressed': unit === id ? 'true' : 'false',
            'aria-label': label,
            'data-unit': id,
            onclick: () => {
              unit = id;
              paintUnits();
              refreshPace();
            },
          }, id));
        }
      };
      const refreshPace = () => {
        const amount = Number(distance.value);
        const mins = Number(minutes.value);
        const secs = Number(seconds.value);
        if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(mins) || !Number.isFinite(secs)) {
          pace.textContent = 'Pace shows up once distance and time are in.';
          return;
        }
        const meters = unit === 'mi' ? amount * 1609.344 : amount;
        const text = formatPace(meters, mins * 60 + secs, unit);
        pace.textContent = text ? `Pace · ${text}` : 'Pace shows up once distance and time are in.';
      };
      const paintFeel = () => {
        feelHost.replaceChildren(feelPicker({
          selected: feel,
          onPick: (value) => {
            feel = value;
            paintFeel();
          },
        }));
      };
      paintTypes();
      paintUnits();
      paintFeel();
      distance.addEventListener('input', refreshPace);
      minutes.addEventListener('input', refreshPace);
      seconds.addEventListener('input', refreshPace);

      const form = el('form', {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          error.hidden = true;
          const amount = Number(distance.value);
          const mins = Number(minutes.value);
          const secs = Number(seconds.value);
          if (!date.value || !sessionType || !Number.isFinite(amount) || amount <= 0) {
            error.hidden = false;
            error.textContent = 'Pick the kind of run and how far.';
            return;
          }
          if (!Number.isInteger(mins) || mins < 0 || !Number.isInteger(secs) || secs < 0 || secs >= 60 || mins + secs === 0) {
            error.hidden = false;
            error.textContent = 'Enter time as minutes and seconds (0–59).';
            return;
          }
          if (!feel) {
            error.hidden = false;
            error.textContent = 'Tap how it felt.';
            return;
          }
          const meters = unit === 'mi' ? amount * 1609.344 : amount;
          try {
            await addTraining({
              person_id: kid.id,
              trained_on: date.value,
              session_type: sessionType,
              distance_m: Math.round(meters * 100) / 100,
              distance_input: amount,
              distance_unit: unit,
              duration_seconds: mins * 60 + secs,
              feel,
              note: note.value.trim() || null,
            });
            closeSheet();
          } catch (err) {
            error.hidden = false;
            error.textContent = err.message || 'Could not save that run.';
          }
        },
      });
      form.append(
        el('p', { class: 'lede' }, kid.name),
        field('When?', date),
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'What kind of run?'), types),
        field('How far?', distance),
        units,
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'How long did it take?'), el('div', { class: 'time-pair' }, field('Minutes', minutes), field('Seconds', seconds))),
        pace,
        el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'How did it feel?'), feelHost),
        field('Anything else?', note, 'Optional'),
        error,
        el('button', { type: 'submit', class: 'btn primary block' }, 'Save run'),
      );
      body.append(form);
      distance.focus();
    },
  });
}

function sessionCard(row, ctx, { showName, testid = true, withCheck = false }) {
  const person = ctx.people.find((item) => item.id === row.person_id);
  const paceMeters = row.distance_m / row.duration_seconds;
  const pace = paceMeters > 0 ? `${formatClock(Math.round(400 / paceMeters))} / 400m` : '';
  const card = el('article', {
    class: 'card log-card',
    'data-testid': testid ? `training-${row.id}` : null,
    'data-person': row.person_id,
  },
  el('p', { class: 'log-kicker' }, `${showName ? `${person?.name || row.person_id} · ` : ''}${formatWeekday(`${row.trained_on}T12:00:00Z`)}`),
  el('h3', { class: 'log-title' }, `${SESSION_LABELS[row.session_type] || row.session_type} · ${formatDistance(row)} · ${formatClock(row.duration_seconds)}`),
  pace ? el('p', { class: 'log-meta', 'data-testid': 'run-pace-saved' }, `Pace · ${pace}`) : null,
  row.feel ? el('p', { class: 'log-meta', 'data-feel': String(row.feel) }, feelPhrase(row.feel)) : null,
  row.note ? el('p', { class: 'event-notes' }, row.note) : null);
  if (withCheck) {
    const boxes = checkoffStack(ctx, [{
      personId: row.person_id,
      itemType: 'training',
      itemId: row.id,
      occurrenceOn: row.trained_on,
      label: SESSION_LABELS[row.session_type] || row.session_type,
    }]);
    if (boxes) card.append(boxes);
  }
  return card;
}

registerModule({
  id: 'training',
  label: 'Log my run',
  dataTable: 'training_entries',
  placement: 'day',
  sortOrder: 30,
  renderEntryForm(ctx) {
    return el('button', {
      type: 'button',
      class: 'btn primary',
      'data-testid': 'add-training',
      onclick: () => chooseKid(ctx, (kid) => openTrainingForm(ctx, kid)),
    }, 'Log my run');
  },
  render(ctx, host) {
    const ids = new Set(peopleInScope(ctx));
    const mine = ctx.training.filter((row) => ids.has(row.person_id));
    const showName = ctx.profile.role === 'parent' && !ctx.focusPersonId;
    const recent = [...mine].sort((a, b) => b.trained_on.localeCompare(a.trained_on) || b.id.localeCompare(a.id)).slice(0, 8);
    if (recent.length) {
      const block = el('section', { class: 'day-block', 'data-testid': 'recent-training' });
      block.append(el('h3', { class: 'day-title' }, 'Recent runs'));
      for (const row of recent) block.append(sessionCard(row, ctx, { showName, testid: false }));
      host.append(block);
    }
    const inRange = mine
      .filter((row) => ymdInRange(row.trained_on, ctx.range))
      .sort((a, b) => a.trained_on.localeCompare(b.trained_on));
    if (!inRange.length && !recent.length) {
      host.append(el('p', { class: 'empty' }, 'No training logged yet.'));
      return;
    }
    const byDay = new Map();
    for (const row of inRange) {
      if (!byDay.has(row.trained_on)) byDay.set(row.trained_on, []);
      byDay.get(row.trained_on).push(row);
    }
    for (const [day, rows] of byDay) {
      const section = el('section', { class: 'day-block', 'data-testid': `training-day-${day}` });
      section.append(el('h3', { class: 'day-title' }, formatWeekday(`${day}T12:00:00Z`)));
      for (const row of rows) section.append(sessionCard(row, ctx, { showName, withCheck: true }));
      host.append(section);
    }
  },
});
