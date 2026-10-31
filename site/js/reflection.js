import { el, field } from './dom.js';
import { PRACTICE_DURATIONS, formatPracticeDuration, scheduledMinutes } from './practice-duration.js';
import { FEELS, feelMeta, feelPhrase, feelPicker } from './feel.js';
import { closeSheet, openSheet } from './sheet.js';
import { saveReflection } from './store.js';

export const PRACTICE_TYPES = [
  ['one_to_one', '1:1 coaching'],
  ['group', 'Group session'],
  ['nets', 'Nets'],
  ['fielding', 'Fielding drills'],
  ['match', 'Match practice'],
  ['fitness', 'Fitness'],
  ['other', 'Other'],
];

export const FOCUS_CHIPS = [
  ['batting', 'Batting'],
  ['bowling', 'Bowling'],
  ['fielding', 'Fielding'],
  ['wicketkeeping', 'Wicketkeeping'],
  ['fitness', 'Fitness'],
  ['mental', 'Mental'],
];

export function cricketKind(categoryId) {
  if (categoryId === 'cricket-practice') return 'practice';
  if (categoryId === 'cricket-games') return 'game';
  return null;
}

export function findReflection(reflections, { personId, itemId, occurrenceOn }) {
  return (reflections || []).find((row) => row.person_id === personId
    && row.event_id === itemId
    && row.occurrence_on === occurrenceOn) || null;
}

export function reflectionBlurb(row) {
  const bits = [];
  if (row.kind === 'practice' && row.session_type) {
    bits.push(PRACTICE_TYPES.find(([id]) => id === row.session_type)?.[1] || row.session_type);
  }
  if (row.kind === 'game') {
    if (row.batted && (row.runs != null || row.balls != null)) {
      bits.push(`${row.runs ?? 0} runs off ${row.balls ?? 0} balls`);
    } else if (row.batted) bits.push('Batted');
    if (row.bowled && (row.overs != null || row.wickets != null)) {
      bits.push(`${row.overs ?? 0} overs, ${row.wickets ?? 0} wickets`);
    } else if (row.bowled) bits.push('Bowled');
    if (row.catches) bits.push(`${row.catches} catch${row.catches === 1 ? '' : 'es'}`);
  }
  const focus = (row.focus || []).map((id) => FOCUS_CHIPS.find(([key]) => key === id)?.[1] || id);
  if (focus.length) bits.push(focus.join(', '));
  if (row.focus_note) bits.push(row.focus_note);
  if (row.kind === 'practice') {
    const length = formatPracticeDuration(row.duration_minutes);
    if (length) bits.push(length);
  }
  const feel = feelPhrase(row.feel);
  if (feel) bits.push(feel);
  const node = el('div', {
    class: 'reflection-blurb',
    'data-testid': `reflection-${row.event_id}-${row.person_id}`,
  });
  if (bits.length) node.append(el('p', {}, bits.join(' · ')));
  if (row.learned) node.append(el('p', { class: 'event-notes' }, row.learned));
  return node;
}

export function cricketRecap(reflections, personId, yesterday) {
  const mine = (reflections || []).filter((row) => row.person_id === personId && row.occurrence_on === yesterday);
  if (!mine.length) return null;
  const counts = new Map();
  for (const row of mine) {
    for (const chip of row.focus || []) counts.set(chip, (counts.get(chip) || 0) + 1);
  }
  const themes = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([id]) => FOCUS_CHIPS.find(([key]) => key === id)?.[1] || id);
  const feels = mine.map((row) => Number(row.feel)).filter((value) => value >= 1 && value <= 5);
  const avg = feels.length ? feels.reduce((sum, value) => sum + value, 0) / feels.length : null;
  const prior = (reflections || []).filter((row) => row.person_id === personId
    && row.occurrence_on < yesterday
    && row.occurrence_on >= shiftBack(yesterday, 14)
    && row.feel);
  let trend = '';
  if (avg != null && prior.length) {
    const priorAvg = prior.reduce((sum, row) => sum + Number(row.feel), 0) / prior.length;
    if (avg >= priorAvg + 0.4) trend = 'Lighter than recent sessions.';
    else if (avg <= priorAvg - 0.4) trend = 'Heavier than recent sessions.';
    else trend = 'In line with recent sessions.';
  }
  const learned = mine.map((row) => row.learned).filter(Boolean);
  const durations = mine
    .filter((row) => row.kind !== 'game')
    .map((row) => formatPracticeDuration(row.duration_minutes))
    .filter(Boolean);
  return {
    themes,
    feel: avg == null ? '' : feelPhrase(Math.round(avg)),
    trend,
    learned,
    durations,
  };
}

function shiftBack(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  return dt.toISOString().slice(0, 10);
}

export function openReflection(ctx, spec, existing) {
  const kind = cricketKind(spec.categoryId);
  if (!kind) return;
  const current = existing || findReflection(ctx.reflections, spec) || {};
  const event = (ctx.events || []).find((item) => item.id === spec.itemId);
  const savedMinutes = Number(current.duration_minutes);
  const state = {
    session_type: current.session_type || '',
    duration_minutes: Number.isFinite(savedMinutes) && savedMinutes > 0
      ? savedMinutes
      : (scheduledMinutes(event?.starts_at, event?.ends_at) ?? ''),
    focus: new Set(current.focus || []),
    focus_note: current.focus_note || '',
    learned: current.learned || '',
    feel: current.feel || null,
    notes: current.notes || '',
    batted: Boolean(current.batted),
    runs: current.runs ?? '',
    balls: current.balls ?? '',
    bowled: Boolean(current.bowled),
    overs: current.overs ?? '',
    wickets: current.wickets ?? '',
    catches: current.catches ?? '',
  };
  openSheet({
    title: kind === 'game' ? 'Game note' : 'Practice note',
    testid: 'reflection-sheet',
    placement: 'bottom',
    render(body) {
      paint(body);
    },
  });

  function paint(body) {
    const stack = el('form', {
      class: 'stack',
      onsubmit: async (event) => {
        event.preventDefault();
        await saveReflection(payload());
        closeSheet();
      },
    });
    stack.append(el('p', { class: 'lede' }, spec.label || 'Quick note. Skip if you are walking to the car.'));
    if (kind === 'practice') {
      stack.append(el('p', { class: 'field-label' }, 'What kind of session?'));
      const types = el('div', { class: 'choice-row' });
      for (const [id, label] of PRACTICE_TYPES) {
        types.append(el('button', {
          type: 'button',
          class: `btn choice${state.session_type === id ? ' is-on' : ''}`,
          'aria-pressed': state.session_type === id ? 'true' : 'false',
          'data-testid': `session-type-${id}`,
          onclick: () => {
            state.session_type = id;
            paint(body);
          },
        }, label));
      }
      stack.append(types);
      stack.append(durationPicker());
    } else {
      stack.append(gameStats());
    }
    stack.append(el('p', { class: 'field-label' }, 'What did you focus on?'));
    const chips = el('div', { class: 'choice-row', 'data-testid': 'focus-chips' });
    for (const [id, label] of FOCUS_CHIPS) {
      const on = state.focus.has(id);
      chips.append(el('button', {
        type: 'button',
        class: `btn choice${on ? ' is-on' : ''}`,
        'aria-pressed': on ? 'true' : 'false',
        'data-testid': `focus-${id}`,
        onclick: () => {
          if (state.focus.has(id)) state.focus.delete(id);
          else state.focus.add(id);
          paint(body);
        },
      }, label));
    }
    stack.append(chips);
    const focusNote = el('input', { type: 'text', value: state.focus_note, maxlength: '120', placeholder: 'Anything else you worked on', 'data-dictate': 'true' });
    focusNote.addEventListener('input', () => { state.focus_note = focusNote.value; });
    const learned = el('textarea', { rows: '2', maxlength: '240', value: state.learned });
    learned.addEventListener('input', () => { state.learned = learned.value; });
    const notes = el('textarea', { rows: '2', maxlength: '240', value: state.notes });
    notes.addEventListener('input', () => { state.notes = notes.value; });
    stack.append(
      field('Other focus', focusNote),
      field('Key things you learned', learned),
      el('p', { class: 'field-label' }, 'How did it feel?'),
      feelPicker({ selected: state.feel, onPick: (value) => { state.feel = value; paint(body); } }),
      field('Anything else?', notes, 'Optional'),
      el('div', { class: 'choice-row' },
        el('button', { type: 'button', class: 'btn ghost', 'data-testid': 'reflection-skip', onclick: () => closeSheet() }, 'Skip'),
        el('button', { type: 'submit', class: 'btn primary', 'data-testid': 'reflection-save' }, 'Save')),
    );
    body.replaceChildren(stack);
  }

  function durationPicker() {
    const selected = Number(state.duration_minutes);
    const onPreset = PRACTICE_DURATIONS.some(([minutes]) => minutes === selected);
    const wrap = el('div', { class: 'stack', 'data-testid': 'practice-duration' });
    wrap.append(el('p', { class: 'field-label' }, 'How long did you practice?'));
    const choices = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'How long did you practice?' });
    for (const [minutes, label] of PRACTICE_DURATIONS) {
      const on = selected === minutes;
      choices.append(el('button', {
        type: 'button',
        class: `btn choice${on ? ' is-on' : ''}`,
        'aria-pressed': on ? 'true' : 'false',
        'data-testid': `duration-${minutes}`,
        onclick: () => {
          state.duration_minutes = on ? '' : minutes;
          const sheetBody = document.querySelector('[data-testid="reflection-sheet"] .sheet-body');
          if (sheetBody) paint(sheetBody);
        },
      }, label));
    }
    const custom = el('input', {
      type: 'text',
      inputmode: 'numeric',
      maxlength: '4',
      placeholder: 'Minutes',
      'data-testid': 'duration-custom',
      'aria-label': 'Custom minutes',
      value: onPreset || !selected ? '' : String(selected),
    });
    custom.addEventListener('input', () => {
      const raw = custom.value.trim();
      const n = Number(raw);
      state.duration_minutes = raw === '' || !Number.isFinite(n) ? '' : Math.round(n);
      for (const button of choices.querySelectorAll('[data-testid^="duration-"]')) {
        const minutes = Number(button.getAttribute('data-testid').replace('duration-', ''));
        const on = state.duration_minutes === minutes;
        button.classList.toggle('is-on', on);
        button.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    });
    wrap.append(choices, field('Or type minutes', custom, 'Optional'));
    return wrap;
  }

  function gameStats() {
    const wrap = el('div', { class: 'stack' });
    wrap.append(el('p', { class: 'field-label' }, 'How did you go? All optional.'));
    wrap.append(toggle('Batted', state.batted, 'batted', 'game-batted'));
    if (state.batted) {
      wrap.append(el('div', { class: 'time-pair' },
        numField('Runs', state.runs, 'game-runs', (value) => { state.runs = value; }),
        numField('Balls', state.balls, 'game-balls', (value) => { state.balls = value; })));
    }
    wrap.append(toggle('Bowled', state.bowled, 'bowled', 'game-bowled'));
    if (state.bowled) {
      wrap.append(el('div', { class: 'time-pair' },
        numField('Overs', state.overs, 'game-overs', (value) => { state.overs = value; }),
        numField('Wickets', state.wickets, 'game-wickets', (value) => { state.wickets = value; })));
    }
    wrap.append(numField('Catches', state.catches, 'game-catches', (value) => { state.catches = value; }));
    return wrap;
  }

  function toggle(label, on, key, testid) {
    return el('button', {
      type: 'button',
      class: `btn choice${on ? ' is-on' : ''}`,
      'aria-pressed': on ? 'true' : 'false',
      'data-testid': testid,
      onclick: () => {
        state[key] = !state[key];
        const body = document.querySelector('[data-testid="reflection-sheet"] .sheet-body');
        if (body) paint(body);
      },
    }, label);
  }

  function numField(label, value, testid, onInput) {
    const input = el('input', {
      type: 'text',
      inputmode: 'decimal',
      value: value === '' || value == null ? '' : String(value),
      'data-testid': testid,
      'aria-label': label,
    });
    input.addEventListener('input', () => onInput(input.value));
    return field(label, input);
  }

  function minutesOrNull(value) {
    if (value === '' || value == null) return null;
    const n = Math.round(Number(value));
    if (!Number.isFinite(n) || n <= 0 || n > 24 * 60) return null;
    return n;
  }

  function numOrNull(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function payload() {
    return {
      id: current.id,
      completion_id: spec.completionId || current.completion_id || null,
      person_id: spec.personId,
      event_id: spec.itemId,
      occurrence_on: spec.occurrenceOn,
      kind,
      session_type: kind === 'practice' ? (state.session_type || null) : null,
      duration_minutes: kind === 'practice' ? minutesOrNull(state.duration_minutes) : null,
      focus: [...state.focus],
      focus_note: state.focus_note.trim() || null,
      learned: state.learned.trim() || null,
      feel: state.feel || null,
      notes: state.notes.trim() || null,
      batted: kind === 'game' ? state.batted : false,
      runs: kind === 'game' && state.batted ? numOrNull(state.runs) : null,
      balls: kind === 'game' && state.batted ? numOrNull(state.balls) : null,
      bowled: kind === 'game' ? state.bowled : false,
      overs: kind === 'game' && state.bowled ? numOrNull(state.overs) : null,
      wickets: kind === 'game' && state.bowled ? numOrNull(state.wickets) : null,
      catches: kind === 'game' ? numOrNull(state.catches) : null,
    };
  }
}

export { FEELS };
