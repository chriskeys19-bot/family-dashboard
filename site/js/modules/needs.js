import { el, field } from '../dom.js';
import { registerModule } from '../registry.js';
import { addNeed, saveFailureMessage, updateNeed } from '../store.js';

const URGENCY = [
  ['low', 'Low'],
  ['normal', 'Normal'],
  ['soon', 'Soon'],
];

const STATUS = [
  ['approved', 'Approved'],
  ['not_now', 'Not now'],
  ['bought', 'Bought'],
];

let flashSaved = false;

function kidIds(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile.id];
  if (ctx.focusPersonId) return [ctx.focusPersonId];
  return ctx.people.filter((person) => person.role === 'kid').map((person) => person.id);
}

function statusLabel(status) {
  if (status === 'approved') return 'Approved';
  if (status === 'not_now') return 'Not now';
  if (status === 'bought') return 'Bought';
  return 'Asked';
}

function labelUrgency(value) {
  return URGENCY.find(([id]) => id === value)?.[1] || 'Normal';
}

function showSaveError(node) {
  node.hidden = false;
  node.textContent = saveFailureMessage();
  node.scrollIntoView({ block: 'center' });
}

function appendSaved(host) {
  if (!flashSaved) return;
  flashSaved = false;
  const note = el('p', { class: 'save-confirm', 'data-testid': 'need-saved', role: 'status' }, 'Saved');
  host.append(note);
  setTimeout(() => note.remove(), 8000);
}

registerModule({
  id: 'needs',
  label: 'Things I need',
  dataTable: 'kid_needs',
  placement: 'day',
  sortOrder: 40,
  renderEntryForm(ctx) {
    if (ctx.profile.role !== 'kid') return null;
    return el('button', {
      type: 'button',
      class: 'btn primary',
      'data-testid': 'add-need',
      onclick: () => {
        document.getElementById('need-item')?.focus();
      },
    }, 'Add a need');
  },
  render(ctx, host) {
    const ids = new Set(kidIds(ctx));
    const mine = (ctx.needs || []).filter((row) => ids.has(row.person_id));
    if (ctx.profile.role === 'kid') host.append(needForm(ctx));
    appendSaved(host);
    if (!mine.length) {
      host.append(el('p', { class: 'empty' }, ctx.profile.role === 'kid' ? 'Nothing on the list yet.' : 'No requests in this view.'));
      return;
    }
    const list = el('div', { class: 'stack', 'data-testid': 'needs-list' });
    const ordered = [...mine].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    for (const row of ordered) list.append(needCard(ctx, row));
    host.append(list);
  },
});

function urgencyControl(selected, testPrefix) {
  let urgency = selected || 'normal';
  const row = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'How soon?' });
  const paint = () => {
    row.replaceChildren();
    for (const [id, label] of URGENCY) {
      const attrs = {
        type: 'button',
        class: `btn choice${urgency === id ? ' is-on' : ''}`,
        'aria-pressed': urgency === id ? 'true' : 'false',
        onclick: () => {
          urgency = id;
          paint();
        },
      };
      if (testPrefix) attrs['data-testid'] = `${testPrefix}${id}`;
      row.append(el('button', attrs, label));
    }
  };
  paint();
  return {
    row,
    get value() { return urgency; },
    reset() {
      urgency = 'normal';
      paint();
    },
  };
}

function needForm(ctx) {
  const item = el('input', { type: 'text', maxlength: '120', 'data-testid': 'need-item', placeholder: 'Bat grips' });
  const why = el('input', { type: 'text', maxlength: '200', 'data-testid': 'need-why', placeholder: 'Optional', 'data-dictate': 'true' });
  const when = el('input', { type: 'date', 'data-testid': 'need-date' });
  const link = el('input', { type: 'url', 'data-testid': 'need-link', placeholder: 'https://' });
  const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': 'need-error', hidden: true });
  const urgency = urgencyControl('normal', 'urgency-');
  let saving = false;
  const form = el('form', {
    class: 'stack card need-form',
    onsubmit: async (event) => {
      event.preventDefault();
      error.hidden = true;
      if (!item.value.trim()) {
        error.hidden = false;
        error.textContent = 'Name the thing you need.';
        return;
      }
      if (saving) return;
      saving = true;
      flashSaved = true;
      try {
        await addNeed({
          person_id: ctx.profile.id,
          item: item.value.trim(),
          why: why.value.trim() || null,
          needed_on: when.value || null,
          link: link.value.trim() || null,
          urgency: urgency.value,
          status: 'open',
          parent_reply: null,
        });
        item.value = '';
        why.value = '';
        when.value = '';
        link.value = '';
        urgency.reset();
      } catch {
        flashSaved = false;
        showSaveError(error);
      } finally {
        saving = false;
      }
    },
  });
  form.append(
    field('What do you need?', item),
    field('Why?', why),
    field('When do you need it?', when),
    field('Link', link),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'How soon?'), urgency.row),
    error,
    el('button', { type: 'submit', class: 'btn primary block' }, 'Add to the list'),
  );
  return form;
}

function needCard(ctx, row) {
  const person = ctx.people.find((item) => item.id === row.person_id);
  const showName = ctx.profile.role === 'parent' && !ctx.focusPersonId;
  const own = ctx.profile.role === 'kid' && row.person_id === ctx.profile.id;
  const card = el('article', {
    class: 'card log-card',
    'data-testid': `need-${row.id}`,
    'data-status': row.status || 'open',
    'data-person': row.person_id,
  });

  const show = () => {
    const nodes = [
      el('p', { class: 'log-kicker' }, `${showName ? `${person?.name || row.person_id} · ` : ''}${statusLabel(row.status)} · ${labelUrgency(row.urgency)}`),
      el('h3', { class: 'log-title' }, row.item),
    ];
    if (row.why) nodes.push(el('p', {}, row.why));
    if (row.needed_on) nodes.push(el('p', { class: 'log-meta' }, `Needed ${row.needed_on}`));
    if (row.link) nodes.push(el('a', { href: row.link, target: '_blank', rel: 'noopener noreferrer' }, 'Link'));
    if (row.parent_reply) nodes.push(el('p', { class: 'need-reply', 'data-testid': `need-reply-text-${row.id}` }, row.parent_reply));
    if (own) {
      nodes.push(el('button', {
        type: 'button',
        class: 'btn secondary',
        'data-testid': `edit-need-${row.id}`,
        onclick: () => edit(),
      }, 'Edit'));
    }
    if (ctx.profile.role === 'parent') nodes.push(...parentControls());
    card.replaceChildren(...nodes);
  };

  const edit = () => {
    const item = el('input', { type: 'text', maxlength: '120', value: row.item || '' });
    const why = el('input', { type: 'text', maxlength: '200', value: row.why || '', 'data-dictate': 'true' });
    const when = el('input', { type: 'date', value: row.needed_on || '' });
    const link = el('input', { type: 'url', value: row.link || '', placeholder: 'https://' });
    const error = el('p', { class: 'form-error', role: 'alert', 'data-testid': `need-edit-error-${row.id}`, hidden: true });
    const urgency = urgencyControl(row.urgency || 'normal');
    let saving = false;
    const form = el('form', {
      class: 'stack',
      onsubmit: async (event) => {
        event.preventDefault();
        error.hidden = true;
        if (!item.value.trim()) {
          error.hidden = false;
          error.textContent = 'Name the thing you need.';
          return;
        }
        if (saving) return;
        saving = true;
        flashSaved = true;
        try {
          await updateNeed(row.id, {
            item: item.value.trim(),
            why: why.value.trim() || null,
            needed_on: when.value || null,
            link: link.value.trim() || null,
            urgency: urgency.value,
          });
        } catch {
          flashSaved = false;
          showSaveError(error);
        } finally {
          saving = false;
        }
      },
    });
    form.append(
      field('What do you need?', item),
      field('Why?', why),
      field('When do you need it?', when),
      field('Link', link),
      el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'How soon?'), urgency.row),
      error,
      el('div', { class: 'form-actions' },
        el('button', { type: 'submit', class: 'btn primary', 'data-testid': `save-need-${row.id}` }, 'Save'),
        el('button', {
          type: 'button',
          class: 'btn secondary',
          'data-testid': `cancel-need-${row.id}`,
          onclick: () => show(),
        }, 'Cancel'),
      ),
    );
    card.replaceChildren(form);
    item.focus();
  };

  function parentControls() {
    const reply = el('input', {
      type: 'text',
      maxlength: '200',
      value: row.parent_reply || '',
      placeholder: 'Short reply',
      'data-testid': `need-reply-${row.id}`,
      'aria-label': `Reply about ${row.item}`,
    });
    const error = el('p', { class: 'form-error', role: 'alert', hidden: true });
    const actions = el('div', { class: 'choice-row' });
    for (const [id, label] of STATUS) {
      actions.append(el('button', {
        type: 'button',
        class: `btn choice${row.status === id ? ' is-on' : ''}`,
        'data-testid': `need-${id}-${row.id}`,
        onclick: async () => {
          error.hidden = true;
          try {
            await updateNeed(row.id, { status: id, parent_reply: reply.value.trim() || null });
          } catch {
            showSaveError(error);
          }
        },
      }, label));
    }
    return [reply, actions, error];
  }

  show();
  return card;
}
