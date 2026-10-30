import { el } from './dom.js';
import { cricketKind, openReflection } from './reflection.js';
import { notifyChange, toggleCompletion } from './store.js';
import { formatISODate } from './time.js';

export function canCheck(ctx, personId) {
  return ctx.profile?.role === 'kid' && ctx.profile.id === personId;
}

export function isChecked(ctx, spec) {
  return (ctx.completions || []).some((row) => row.person_id === spec.personId
    && row.item_type === spec.itemType
    && row.item_id === spec.itemId
    && row.occurrence_on === spec.occurrenceOn
    && row.completed_at);
}

/** Pacific date this card’s checkbox represents. Multi-day blocks use today when today falls inside. */
export function eventOccurrenceOn(item, todayISO) {
  const start = formatISODate(item.starts_at);
  if (!item.multi_day) return start;
  const endMs = new Date(item.ends_at).getTime() - 1;
  const endDay = formatISODate(endMs);
  if (todayISO >= start && todayISO <= endDay) return todayISO;
  return start;
}

export function checkoffControl(ctx, spec) {
  const person = ctx.people.find((item) => item.id === spec.personId);
  const done = isChecked(ctx, spec);
  const allowed = canCheck(ctx, spec.personId);
  const input = el('input', {
    type: 'checkbox',
    'data-testid': `check-${spec.itemType}-${spec.itemId}-${spec.personId}-${spec.occurrenceOn}`,
    'aria-label': `${person?.name || spec.personId}: ${spec.label}`,
  });
  input.checked = done;
  input.disabled = !allowed;
  if (allowed) {
    input.addEventListener('change', async () => {
      const next = input.checked;
      try {
        const saved = await toggleCompletion({ ...spec, done: next, silent: true });
        if (next && cricketKind(spec.categoryId)) {
          openReflection(ctx, { ...spec, completionId: saved?.id });
        }
        notifyChange();
      } catch {
        input.checked = !next;
      }
    });
  }
  const who = ctx.profile.role === 'parent' && !ctx.focusPersonId ? `${person?.name || spec.personId} · ` : '';
  return el('label', { class: `checkoff${done ? ' is-done' : ''}${allowed ? '' : ' is-readonly'}` },
    input,
    el('span', {}, done ? `${who}Done` : `${who}Mark done`));
}

export function checkoffStack(ctx, specs) {
  if (!specs.length) return null;
  return el('div', { class: 'checkoff-stack' }, specs.map((spec) => checkoffControl(ctx, spec)));
}
