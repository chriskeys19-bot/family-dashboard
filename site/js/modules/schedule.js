import { checkoffStack, eventOccurrenceOn } from '../checkoff.js';
import { findReflection, openReflection, reflectionBlurb } from '../reflection.js';
import { el, field, safeColor } from '../dom.js';
import { iconEl } from '../icons.js';
import { chooseKid } from '../kids.js';
import { STATUS_LABELS } from '../labels.js';
import { markOverlaps } from '../overlap.js';
import { registerModule } from '../registry.js';
import { closeSheet, openSheet } from '../sheet.js';
import { addRequest, notifyChange, saveCategory } from '../store.js';
import { formatEventWhen, formatISODate, overlapsRange, zonedDateTimeFromISO } from '../time.js';

const PALETTE = ['#1c5c3b', '#7a4e8a', '#c4622d', '#2a6f8f', '#3d5a80', '#9b2335'];

function personIndex(ctx, id) {
  return ctx.people.findIndex((person) => person.id === id);
}

function personColor(ctx, id) {
  const index = personIndex(ctx, id);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

function sortedPeople(ids, ctx) {
  return [...ids].sort((a, b) => personIndex(ctx, a) - personIndex(ctx, b));
}

function viewerIsKid(ctx) {
  return ctx.profile.role === 'kid';
}

function visibleCategory(category, ctx) {
  if (!viewerIsKid(ctx)) return true;
  return category.visible_to_kids !== false;
}

function inFocus(peopleIds, ctx) {
  if (ctx.profile.role === 'kid') return peopleIds.includes(ctx.profile.id);
  if (!ctx.focusPersonId) return true;
  return peopleIds.includes(ctx.focusPersonId);
}

function requestAsItem(row) {
  return {
    id: row.id,
    kind: 'request',
    title: row.title,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    all_day: false,
    multi_day: false,
    location: row.location || '',
    people: [row.person_id],
    category_id: row.category_id || 'social',
    status: row.status || 'requested',
    notes: row.notes || '',
  };
}

function peopleLine(ids, ctx) {
  const row = el('div', { class: 'people' });
  for (const id of sortedPeople(ids, ctx)) {
    const person = ctx.people.find((item) => item.id === id);
    const name = person?.name || id;
    const avatar = el('span', { class: 'avatar', title: name }, name.slice(0, 1).toUpperCase());
    avatar.style.background = personColor(ctx, id);
    row.append(el('span', { class: 'person' }, avatar, name));
  }
  return row;
}

function openCategoryEditor(ctx) {
  const drafts = ctx.categories.map((category) => ({ ...category }));
  openSheet({
    title: 'Categories',
    render(body) {
      const list = el('div', { class: 'stack' });
      const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
      const paint = () => {
        list.replaceChildren();
        drafts.sort((a, b) => Number(a.sort_order) - Number(b.sort_order) || a.label.localeCompare(b.label));
        for (const draft of drafts) {
          const label = el('input', { type: 'text', value: draft.label, 'aria-label': `Label for ${draft.id || 'new category'}` });
          const color = el('input', { type: 'color', value: safeColor(draft.color), 'aria-label': `Color for ${draft.label || 'category'}` });
          const icon = el('input', { type: 'text', value: draft.icon || '', 'aria-label': `Icon for ${draft.label || 'category'}` });
          const sort = el('input', { type: 'text', inputmode: 'numeric', value: String(draft.sort_order), 'aria-label': `Sort order for ${draft.label || 'category'}` });
          const visible = el('input', { type: 'checkbox', 'aria-label': `Visible to kids: ${draft.label || 'category'}` });
          visible.checked = draft.visible_to_kids !== false;
          label.addEventListener('input', () => { draft.label = label.value; });
          color.addEventListener('input', () => { draft.color = color.value; });
          icon.addEventListener('input', () => { draft.icon = icon.value.trim(); });
          sort.addEventListener('input', () => { draft.sort_order = Number(sort.value) || 0; });
          visible.addEventListener('change', () => { draft.visible_to_kids = visible.checked; });
          list.append(el('div', { class: 'category-edit' },
            color,
            label,
            icon,
            sort,
            el('label', { class: 'check' }, visible, 'Visible to kids')));
        }
      };
      paint();
      body.append(
        el('p', { class: 'lede' }, 'These sections drive the schedule. Kids only see categories marked visible.'),
        list,
        el('button', {
          type: 'button',
          class: 'btn secondary block',
          onclick: () => {
            const idBase = `category-${drafts.length + 1}`;
            drafts.push({
              id: idBase,
              label: 'New category',
              color: '#3d5a80',
              icon: 'book',
              sort_order: drafts.length + 1,
              visible_to_kids: true,
              _create: true,
            });
            paint();
          },
        }, 'Add category'),
        error,
        el('button', {
          type: 'button',
          class: 'btn primary block',
          onclick: async () => {
            error.hidden = true;
            try {
              const used = new Set(drafts.filter((draft) => !draft._create).map((draft) => draft.id));
              for (const draft of drafts) {
                const label = draft.label.trim();
                if (!label) throw new Error('Every category needs a label.');
                let id = draft.id;
                if (draft._create) {
                  id = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'category';
                  let unique = id;
                  let n = 2;
                  while (used.has(unique)) {
                    unique = `${id}-${n}`;
                    n += 1;
                  }
                  id = unique;
                  used.add(id);
                }
                await saveCategory({
                  id,
                  label,
                  color: safeColor(draft.color),
                  icon: (draft.icon || 'book').trim(),
                  sort_order: Number(draft.sort_order) || 0,
                  visible_to_kids: draft.visible_to_kids !== false,
                }, { create: Boolean(draft._create), silent: true });
              }
              closeSheet();
              notifyChange();
            } catch (err) {
              error.hidden = false;
              error.textContent = err.message || 'Could not save categories.';
            }
          },
        }, 'Save categories'),
      );
    },
  });
}

function openSocialForm(ctx, kid) {
  openSheet({
    title: 'Add social',
    render(body) {
      const today = formatISODate(ctx.now);
      const title = el('input', { type: 'text', required: false, autocomplete: 'off', maxlength: '120', placeholder: 'Movie, dinner, hangout' });
      const date = el('input', { type: 'date', value: today });
      const start = el('input', { type: 'time', step: '60' });
      const end = el('input', { type: 'time', step: '60' });
      const where = el('input', { type: 'text', autocomplete: 'off', placeholder: 'Place' });
      const note = el('textarea', { rows: '3', maxlength: '400' });
      const error = el('p', { class: 'form-error', 'data-testid': 'form-error', hidden: true });
      const form = el('form', {
        class: 'stack',
        onsubmit: async (event) => {
          event.preventDefault();
          error.hidden = true;
          const titleText = title.value.trim();
          const whereText = where.value.trim();
          if (!titleText || !date.value || !start.value || !end.value || !whereText) {
            error.hidden = false;
            error.textContent = 'Add a title, date, start, end, and where.';
            return;
          }
          const starts = zonedDateTimeFromISO(date.value, start.value);
          const ends = zonedDateTimeFromISO(date.value, end.value);
          if (ends.getTime() <= starts.getTime()) {
            error.hidden = false;
            error.textContent = 'End time needs to be after the start.';
            return;
          }
          try {
            await addRequest({
              person_id: kid.id,
              title: titleText,
              starts_at: starts.toISOString(),
              ends_at: ends.toISOString(),
              location: whereText,
              notes: note.value.trim() || null,
              category_id: 'social',
              status: 'requested',
            });
            closeSheet();
          } catch (err) {
            error.hidden = false;
            error.textContent = err.message || 'Could not save that request.';
          }
        },
      });
      form.append(
        el('p', { class: 'lede' }, `${kid.name} · saved as a request. Nothing is emailed from this site.`),
        field('Title', title),
        field('Date', date),
        field('Start', start),
        field('End', end),
        field('Where', where),
        field('Note', note, 'Optional'),
        error,
        el('button', { type: 'submit', class: 'btn primary block' }, 'Save request'),
      );
      body.append(form);
      title.focus();
    },
  });
}

function renderCard(item, ctx, overlaps) {
  const people = sortedPeople(item.people || [], ctx).join(',');
  const card = el('article', {
    class: `card event${overlaps.length ? ' is-overlap' : ''}`,
    'data-testid': item.kind === 'request' ? `request-${item.id}` : `event-${item.id}`,
    'data-status': item.status,
    'data-people': people,
    'data-overlap': overlaps.length ? 'true' : 'false',
    'data-multiday': item.multi_day ? 'true' : 'false',
  });
  card.append(el('p', { class: 'event-when' }, formatEventWhen(item)));
  card.append(el('h3', { class: 'event-title' }, item.title));
  if (item.location) card.append(el('p', { class: 'event-where' }, item.location));
  const meta = el('div', { class: 'event-meta' });
  meta.append(peopleLine(item.people || [], ctx));
  meta.append(el('span', { class: `badge badge-${item.status}` }, STATUS_LABELS[item.status] || item.status));
  card.append(meta);
  if (overlaps.length) {
    const names = overlaps.map((other) => other.title).join('; ');
    card.append(el('p', { class: 'overlap' }, `Overlaps ${names}`));
  }
  const notes = item.notes && !/^Recurring /.test(item.notes) ? item.notes : '';
  if (notes) card.append(el('p', { class: 'event-notes' }, notes));
  const today = formatISODate(ctx.now);
  const ids = sortedPeople(item.people || [], ctx).filter((id) => {
    if (ctx.profile.role === 'kid') return id === ctx.profile.id;
    if (ctx.focusPersonId) return id === ctx.focusPersonId;
    return true;
  });
  const occurrenceOn = eventOccurrenceOn(item, today);
  const specs = ids.map((personId) => ({
    personId,
    itemType: item.kind === 'request' ? 'request' : 'event',
    itemId: item.id,
    occurrenceOn,
    categoryId: item.category_id,
    label: item.title,
  }));
  const boxes = checkoffStack(ctx, specs);
  if (boxes) card.append(boxes);
  for (const spec of specs) {
    const found = findReflection(ctx.reflections, spec);
    if (found) card.append(reflectionBlurb(found));
    const checked = (ctx.completions || []).some((row) => row.person_id === spec.personId
      && row.item_id === spec.itemId
      && row.occurrence_on === spec.occurrenceOn
      && row.completed_at);
    if (ctx.profile.role === 'kid' && ctx.profile.id === spec.personId && checked && (spec.categoryId === 'cricket-practice' || spec.categoryId === 'cricket-games')) {
      card.append(el('button', {
        type: 'button',
        class: 'btn ghost',
        'data-testid': `edit-reflection-${spec.itemId}-${spec.personId}`,
        onclick: () => openReflection(ctx, spec, found),
      }, found ? 'Edit reflection' : 'Add reflection'));
    }
  }
  return card;
}

registerModule({
  id: 'schedule',
  label: 'Schedule',
  dataTable: 'events',
  placement: 'category',
  sortOrder: 10,
  renderEntryForm(ctx) {
    return el('button', {
      type: 'button',
      class: 'btn primary',
      'data-testid': 'add-social',
      onclick: () => chooseKid(ctx, (kid) => openSocialForm(ctx, kid)),
    }, 'Add social');
  },
  render(ctx, host) {
    const categories = [...ctx.categories]
      .filter((category) => visibleCategory(category, ctx))
      .sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label));
    const hidden = new Set(ctx.categories.filter((category) => !visibleCategory(category, ctx)).map((category) => category.id));
    const events = ctx.events.filter((event) => overlapsRange(event.starts_at, event.ends_at, ctx.range))
      .filter((event) => !hidden.has(event.category_id))
      .filter((event) => inFocus(event.people || [], ctx));
    const requests = ctx.requests
      .filter((row) => overlapsRange(row.starts_at, row.ends_at, ctx.range))
      .filter((row) => !hidden.has(row.category_id || 'social'))
      .filter((row) => inFocus([row.person_id], ctx))
      .map(requestAsItem);
    const items = [...events, ...requests];
    const overlaps = markOverlaps(items);
    let shown = 0;
    for (const category of categories) {
      const rows = items
        .filter((item) => item.category_id === category.id)
        .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
      if (!rows.length) continue;
      shown += rows.length;
      const section = el('section', { class: 'category', 'data-testid': `category-${category.id}` });
      const heading = el('h3', { class: 'category-title' });
      const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' });
      swatch.style.background = safeColor(category.color);
      heading.append(swatch, iconEl(category.icon), category.label);
      section.append(heading);
      for (const row of rows) section.append(renderCard(row, ctx, overlaps.get(row.id) || []));
      host.append(section);
    }
    if (!shown) host.append(el('p', { class: 'empty' }, 'Nothing on the schedule in this range.'));
    if (ctx.profile.role === 'parent') {
      host.append(el('button', {
        type: 'button',
        class: 'btn ghost block edit-categories',
        'data-testid': 'edit-categories',
        onclick: () => openCategoryEditor(ctx),
      }, 'Edit categories'));
    }
  },
});
