import { feelPhrase } from './feel.js';
import { MEAL_LABELS, SESSION_LABELS } from './labels.js';
import { eventTouchesDay, formatISODate, shiftISODate } from './time.js';

function checked(completions, personId, itemType, itemId, occurrenceOn) {
  return (completions || []).some((row) => row.person_id === personId
    && row.item_type === itemType
    && row.item_id === itemId
    && row.occurrence_on === occurrenceOn
    && row.completed_at);
}

/**
 * Yesterday, in America/Los_Angeles, for one person.
 * Suggestions are rule-based and capped at two. Tone stays light.
 */
export function buildRecap({ person, events, nutrition, training, completions, todayISO }) {
  const yesterday = shiftISODate(todayISO, -1);
  const scheduled = (events || []).filter((event) => (event.people || []).includes(person.id)
    && event.status === 'confirmed'
    && eventTouchesDay(event.starts_at, event.ends_at, yesterday));
  const doneEvents = scheduled.filter((event) => checked(completions, person.id, 'event', event.id, yesterday));
  const missedEvents = scheduled.filter((event) => !checked(completions, person.id, 'event', event.id, yesterday));
  const meals = (nutrition || []).filter((row) => row.person_id === person.id && formatISODate(row.eaten_at) === yesterday);
  const sessions = (training || []).filter((row) => row.person_id === person.id && row.trained_on === yesterday);
  const estimated = meals.filter((row) => row.source !== 'note' && row.protein_g != null);
  const protein = Math.round(estimated.reduce((sum, row) => sum + Number(row.protein_g || 0), 0) * 10) / 10;

  const suggestions = [];
  if (missedEvents.some((event) => event.category_id === 'cricket-practice')) {
    suggestions.push('Practice was on the list without a check. If you were there, you can still mark it. If not, today is a fresh page.');
  } else if (missedEvents.length) {
    suggestions.push('One thing stayed unchecked. Mark it if it happened — no speech required.');
  }
  if (!meals.length) {
    suggestions.push('No meals got logged yesterday. A rough note is enough, even after the fact.');
  } else if (estimated.length && protein < 40) {
    suggestions.push('Protein looked a little light. Milk, eggs, yogurt, or dal is an easy add next time.');
  }
  if (!sessions.length) {
    suggestions.push('No training log yesterday. If you ran, jot it down. If you rested, that can be the plan.');
  }
  const picked = suggestions.slice(0, 2);
  if (!picked.length) picked.push('Yesterday looks covered. That’s a solid day.');

  return {
    yesterday,
    doneEvents,
    missedEvents,
    meals,
    sessions,
    protein: estimated.length ? protein : null,
    suggestions: picked,
    doneCount: doneEvents.length + meals.length + sessions.length,
    missedCount: missedEvents.length,
  };
}

export function mealLine(row) {
  const kcal = row.calories == null ? '' : ` · ~${Math.round(Number(row.calories))} kcal`;
  return `${MEAL_LABELS[row.meal] || row.meal}: ${row.description}${kcal}`;
}

export function sessionLine(row) {
  const type = SESSION_LABELS[row.session_type] || row.session_type;
  const feel = feelPhrase(row.feel);
  return feel ? `${type} · ${feel}` : type;
}
