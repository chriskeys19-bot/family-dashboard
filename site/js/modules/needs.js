import { el, field } from '../dom.js';
import { registerModule } from '../registry.js';
import { addNeed, updateNeed } from '../store.js';

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

function needForm(ctx) {
  let urgency = 'normal';
  const item = el('input', { type: 'text', maxlength: '120', 'data-testid': 'need-item', placeholder: 'Bat grips' });
  const why = el('input', { type: 'text', maxlength: '200', 'data-testid': 'need-why', placeholder: 'Optional' });
  const when = el('input', { type: 'date', 'data-testid': 'need-date' });
  const link = el('input', { type: 'url', 'data-testid': 'need-link', placeholder: 'https://' });
  const error = el('p', { class: 'form-error', hidden: true });
  const urgencyRow = el('div', { class: 'choice-row', role: 'group', 'aria-label': 'Urgency' });
  const paint = () => {
    urgencyRow.replaceChildren();
    for (const [id, label] of URGENCY) {
      urgencyRow.append(el('button', {
        type: 'button',
        class: `btn choice${urgency === id ? ' is-on' : ''}`,
        'aria-pressed': urgency === id ? 'true' : 'false',
        'data-testid': `urgency-${id}`,
        onclick: () => {
          urgency = id;
          paint();
        },
      }, label));
    }
  };
  paint();
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
      await addNeed({
        person_id: ctx.profile.id,
        item: item.value.trim(),
        why: why.value.trim() || null,
        needed_on: when.value || null,
        link: link.value.trim() || null,
        urgency,
        status: 'open',
        parent_reply: null,
      });
    },
  });
  form.append(
    field('What do you need?', item),
    field('Why?', why),
    field('When do you need it?', when),
    field('Link', link),
    el('div', { class: 'field' }, el('span', { class: 'field-label' }, 'How soon?'), urgencyRow),
    error,
    el('button', { type: 'submit', class: 'btn primary block' }, 'Add to the list'),
  );
  return form;
}

function needCard(ctx, row) {
  const person = ctx.people.find((item) => item.id === row.person_id);
  const showName = ctx.profile.role === 'parent' && !ctx.focusPersonId;
  const card = el('article', {
    class: 'card log-card',
    'data-testid': `need-${row.id}`,
    'data-status': row.status || 'open',
    'data-person': row.person_id,
  });
  card.append(el('p', { class: 'log-kicker' }, `${showName ? `${person?.name || row.person_id} · ` : ''}${statusLabel(row.status)} · ${labelUrgency(row.urgency)}`));
  card.append(el('h3', { class: 'log-title' }, row.item));
  if (row.why) card.append(el('p', {}, row.why));
  if (row.needed_on) card.append(el('p', { class: 'log-meta' }, `Needed ${row.needed_on}`));
  if (row.link) {
    const anchor = el('a', { href: row.link, target: '_blank', rel: 'noopener noreferrer' }, 'Link');
    card.append(anchor);
  }
  if (row.parent_reply) card.append(el('p', { class: 'need-reply', 'data-testid': `need-reply-text-${row.id}` }, row.parent_reply));
  if (ctx.profile.role === 'parent') {
    const reply = el('input', {
      type: 'text',
      maxlength: '200',
      value: row.parent_reply || '',
      placeholder: 'Short reply',
      'data-testid': `need-reply-${row.id}`,
      'aria-label': `Reply about ${row.item}`,
    });
    const actions = el('div', { class: 'choice-row' });
    for (const [id, label] of STATUS) {
      actions.append(el('button', {
        type: 'button',
        class: `btn choice${row.status === id ? ' is-on' : ''}`,
        'data-testid': `need-${id}-${row.id}`,
        onclick: () => updateNeed(row.id, { status: id, parent_reply: reply.value.trim() || null }),
      }, label));
    }
    card.append(reply, actions);
  }
  return card;
}

function labelUrgency(value) {
  return URGENCY.find(([id]) => id === value)?.[1] || 'Normal';
}
