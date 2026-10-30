import { el } from './dom.js';
import { closeSheet, openSheet } from './sheet.js';

export function kidTargets(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile];
  if (ctx.focusPersonId) return ctx.people.filter((person) => person.id === ctx.focusPersonId);
  return ctx.people.filter((person) => person.role === 'kid');
}

export function chooseKid(ctx, onPick) {
  const kids = kidTargets(ctx);
  if (kids.length <= 1) {
    if (kids[0]) onPick(kids[0]);
    return;
  }
  openSheet({
    title: 'Who is this for?',
    render(body) {
      body.append(el('p', { class: 'lede' }, 'Pick a kid. This stays on their day only.'));
      for (const kid of kids) {
        body.append(el('button', {
          type: 'button',
          class: 'btn primary block',
          'data-testid': `pick-kid-${kid.id}`,
          onclick: () => {
            closeSheet();
            onPick(kid);
          },
        }, kid.name));
      }
    },
  });
}
