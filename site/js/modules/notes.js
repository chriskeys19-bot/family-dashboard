import { el, field } from '../dom.js';
import { registerModule } from '../registry.js';
import { addNote } from '../store.js';
import { formatTime, formatWeekday } from '../time.js';

const MOODS = ['😄', '🙂', '😐', '😕', '😴'];

function kidIds(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile.id];
  if (ctx.focusPersonId) return [ctx.focusPersonId];
  return ctx.people.filter((person) => person.role === 'kid').map((person) => person.id);
}

registerModule({
  id: 'notes',
  label: 'My notes',
  dataTable: 'kid_notes',
  placement: 'day',
  sortOrder: 50,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    const ids = new Set(kidIds(ctx));
    const mine = (ctx.notes || []).filter((row) => ids.has(row.person_id))
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    if (ctx.profile.role === 'kid') host.append(noteForm(ctx));
    else host.append(el('p', { class: 'lede' }, 'Notes stay between that kid and you.'));
    if (!mine.length) {
      host.append(el('p', { class: 'empty' }, 'No notes yet.'));
      return;
    }
    const list = el('div', { class: 'stack', 'data-testid': 'notes-list' });
    for (const row of mine) {
      const person = ctx.people.find((item) => item.id === row.person_id);
      const showName = ctx.profile.role === 'parent' && !ctx.focusPersonId;
      list.append(el('article', {
        class: 'card log-card',
        'data-testid': `note-${row.id}`,
        'data-person': row.person_id,
      },
      el('p', { class: 'log-kicker' }, `${showName ? `${person?.name || row.person_id} · ` : ''}${row.mood ? `${row.mood} · ` : ''}${formatWeekday(row.created_at)} · ${formatTime(row.created_at)}`),
      el('p', {}, row.body)));
    }
    host.append(list);
  },
});

function noteForm(ctx) {
  let mood = '';
  const body = el('textarea', { rows: '3', maxlength: '2000', 'data-testid': 'note-body', placeholder: 'A thought, a worry, something that went well' });
  const error = el('p', { class: 'form-error', hidden: true });
  const moods = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'Mood' });
  const paint = () => {
    moods.replaceChildren();
    for (const face of MOODS) {
      moods.append(el('button', {
        type: 'button',
        class: `btn choice feel-btn${mood === face ? ' is-on' : ''}`,
        'aria-label': `Mood ${face}`,
        'aria-pressed': mood === face ? 'true' : 'false',
        'data-testid': `mood-${face}`,
        onclick: () => {
          mood = mood === face ? '' : face;
          paint();
        },
      }, face));
    }
  };
  paint();
  const form = el('form', {
    class: 'stack card',
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      if (!body.value.trim()) {
        error.hidden = false;
        error.textContent = 'Write a note first.';
        return;
      }
      await addNote({
        person_id: ctx.profile.id,
        body: body.value.trim(),
        mood: mood || null,
        created_at: new Date().toISOString(),
      });
    },
  });
  form.append(
    field('What’s on your mind?', body),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Mood'), moods),
    error,
    el('button', { type: 'submit', class: 'btn primary block', 'data-testid': 'save-note' }, 'Save note'),
  );
  return form;
}
