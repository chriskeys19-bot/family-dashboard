import { boostForPerson } from '../boost.js';
import { el } from '../dom.js';
import { registerModule } from '../registry.js';
import { formatISODate } from '../time.js';

function subjects(ctx) {
  if (ctx.profile.role === 'kid') return [ctx.profile];
  if (ctx.focusPersonId) return ctx.people.filter((person) => person.id === ctx.focusPersonId);
  return [ctx.profile];
}

function quoteBlock(quote) {
  return el('blockquote', { class: 'boost-quote', 'data-testid': 'boost-quote' },
    el('p', {}, quote?.text || ''),
    quote?.attribution ? el('p', { class: 'boost-by', 'data-testid': 'boost-attribution' }, quote.attribution) : null);
}

registerModule({
  id: 'boost',
  label: 'Daily boost',
  dataTable: 'daily_content',
  placement: 'day',
  sortOrder: 2,
  renderEntryForm() {
    return null;
  },
  render(ctx, host) {
    const lists = ctx.boostLists;
    const today = formatISODate(ctx.now);
    if (!lists) {
      host.append(el('p', { class: 'empty' }, 'The daily bank isn’t loaded.'));
      return;
    }
    for (const person of subjects(ctx)) {
      const boost = boostForPerson(lists, person, today);
      const card = el('article', {
        class: 'card boost-card',
        'data-testid': `boost-${person.id}`,
        'data-audience': boost.audience,
      });
      card.append(el('p', { class: 'log-kicker' }, person.name));
      card.append(quoteBlock(boost.quote));
      if (boost.audience === 'kid') {
        card.append(el('p', { class: 'boost-joke', 'data-testid': 'boost-joke' }, boost.joke?.text || ''));
      } else {
        card.append(el('p', { class: 'calm-line', 'data-testid': 'boost-calm' }, boost.calm?.text || ''));
        card.append(el('p', { class: 'tip-line', 'data-testid': 'boost-tip' }, boost.tip?.text || ''));
      }
      host.append(card);
    }
  },
});
