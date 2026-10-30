import { el, field } from '../dom.js';
import { registerModule } from '../registry.js';
import { addNote, saveFailureMessage, updateNote } from '../store.js';
import { formatTime, formatWeekday } from '../time.js';

const MOODS = ['😄', '🙂', '😐', '😕', '😴'];

let flashSaved = false;

function kidIds(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile.id];
  if (ctx.focusPersonId) return [ctx.focusPersonId];
  return ctx.people.filter((person) => person.role === 'kid').map((person) => person.id);
}

function showSaveError(node) {
  node.hidden = false;
  node.textContent = saveFailureMessage();
  node.scrollIntoView({ block: 'center' });
}

function appendSaved(host) {
  if (!flashSaved) return;
  flashSaved = false;
  const note = el('p', { class: 'save-confirm', 'data-testid': 'note-saved', role: 'status' }, 'Saved');
  host.append(note);
  setTimeout(() => note.remove(), 8000);
}

function kickerText(ctx, row) {
  const person = ctx.people.find((item) => item.id === row.person_id);
  const showName = ctx.profile.role === 'parent' && !ctx.focusPersonId;
  return `${showName ? `${person?.name || row.person_id} · ` : ''}${row.mood ? `${row.mood} · ` : ''}${formatWeekday(row.created_at)} · ${formatTime(row.created_at)}`;
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
    appendSaved(host);
    if (!mine.length) {
      host.append(el('p', { class: 'empty' }, 'No notes yet.'));
      return;
    }
    const list = el('div', { class: 'stack', 'data-testid': 'notes-list' });
    for (const row of mine) list.append(noteCard(ctx, row));
    host.append(list);
  },
});

function noteForm(ctx) {
  let mood = '';
  const body = el('textarea', { rows: '3', maxlength: '2000', 'data-testid': 'note-body', placeholder: 'A thought, a worry, something that went well' });
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'note-error', hidden: true });
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
  let saving = false;
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
      if (saving) return;
      saving = true;
      flashSaved = true;
      try {
        await addNote({
          person_id: ctx.profile.id,
          body: body.value.trim(),
          mood: mood || null,
          created_at: new Date().toISOString(),
        });
        body.value = '';
        mood = '';
        paint();
      } catch {
        flashSaved = false;
        showSaveError(error);
      } finally {
        saving = false;
      }
    },
  });
  form.append(
    field('What’s on your mind?', body),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'Mood'), moods),
    error,
    el('button', { type: 'submit', class: 'btn primary block', 'data-testid': 'save-kid-note' }, 'Save note'),
  );
  return form;
}

function noteCard(ctx, row) {
  const own = ctx.profile.role === 'kid' && row.person_id === ctx.profile.id;
  const card = el('article', {
    class: 'card log-card',
    'data-testid': `note-${row.id}`,
    'data-person': row.person_id,
  });

  const show = () => {
    const nodes = [
      el('p', { class: 'log-kicker' }, kickerText(ctx, row)),
      el('p', {}, row.body),
    ];
    if (own) {
      nodes.push(el('button', {
        type: 'button',
        class: 'btn secondary',
        'data-testid': `edit-note-${row.id}`,
        onclick: () => edit(),
      }, 'Edit'));
    }
    card.replaceChildren(...nodes);
  };

  const edit = () => {
    const body = el('textarea', {
      rows: '3',
      maxlength: '2000',
      'data-testid': `edit-note-body-${row.id}`,
    });
    body.value = row.body || '';
    const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': `note-edit-error-${row.id}`, hidden: true });
    let saving = false;
    const form = el('form', {
      class: 'stack',
      onsubmit: async (event) => {
        event.preventDefault();
        error.hidden = true;
        if (!body.value.trim()) {
          error.hidden = false;
          error.textContent = 'Write a note first.';
          return;
        }
        if (saving) return;
        saving = true;
        flashSaved = true;
        try {
          await updateNote(row.id, { body: body.value.trim() });
        } catch {
          flashSaved = false;
          showSaveError(error);
        } finally {
          saving = false;
        }
      },
    });
    form.append(
      el('p', { class: 'log-kicker' }, kickerText(ctx, row)),
      field('What’s on your mind?', body),
      error,
      el('div', { class: 'form-actions' },
        el('button', { type: 'submit', class: 'btn primary', 'data-testid': `save-note-${row.id}` }, 'Save'),
        el('button', {
          type: 'button',
          class: 'btn secondary',
          'data-testid': `cancel-note-${row.id}`,
          onclick: () => show(),
        }, 'Cancel'),
      ),
    );
    card.replaceChildren(form);
    body.focus();
  };

  show();
  return card;
}
